import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OllamaProvider } from '../../src/modules/ai-transactions/ollama-provider.js';
import {
  ORGANIZER_PROMPT_VERSION,
  PROMPT_VERSION,
} from '../../src/modules/ai-transactions/provider.js';
import {
  scopedMessage,
  validateOrganization,
  organizeMessage,
  canUseSingleFlow,
} from '../../src/modules/ai-transactions/organization.js';
import { resolveBatchProposal } from '../../src/modules/ai-transactions/batch-resolution.js';
import { dockerFetch } from './docker-fetch.js';

const accounts = [
  { id: 'nu', name: 'Nu' },
  { id: 'bank', name: 'Bancolombia' },
];
const categories = [
  { id: 'food', name: 'Alimentación', type: 'expense' as const },
  { id: 'transport', name: 'Transporte', type: 'expense' as const },
  { id: 'market', name: 'Mercado', type: 'expense' as const },
  { id: 'salary', name: 'Salario', type: 'income' as const },
];
const context = {
  accounts: accounts.map(({ name }) => ({ name })),
  categories: categories.map(({ name, type }) => ({ name, type })),
  today: '2026-10-28',
  timeZone: 'America/Bogota',
};
const options = {
  baseUrl:
    process.env.OLLAMA_BASE_URL ??
    (process.env.AI_EVALUATION_DOCKER === '1' ? 'http://ollama:11434' : 'http://127.0.0.1:11434'),
  model: process.env.OLLAMA_MODEL ?? 'qwen3:4b-instruct',
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000),
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
  numPredict: Number(process.env.OLLAMA_NUM_PREDICT ?? 768),
};
const request = process.env.AI_EVALUATION_DOCKER === '1' ? dockerFetch : fetch;
const provider = new OllamaProvider(options, request);
const cases = [
  {
    name: 'single transaction retained',
    message: 'Gasté 35k en un almuerzo con Nu',
    expected: [{ amount: 3500000, accountId: 'nu', type: 'expense', date: '2026-10-28' }],
  },
  {
    name: 'dates inherited from headings',
    message:
      'Hoy:\n- Gasté 15000 de Uber con Nu\nEl viernes pasado:\n- Compré un café por 7500 con Nu\n20/10/2026:\n- Gasté 35k en un almuerzo desde Bancolombia',
    expected: [
      { amount: 1500000, date: '2026-10-28', accountId: 'nu' },
      { amount: 750000, date: '2026-10-23', accountId: 'nu' },
      { amount: 3500000, date: '2026-10-20', accountId: 'bank' },
    ],
  },
  {
    name: 'multiple operations in prose',
    message:
      'Hoy gasté 15000 en Uber con Nu y después recibí un salario por 1000000 en Bancolombia.',
    expected: [
      { amount: 1500000, type: 'expense', accountId: 'nu', date: '2026-10-28' },
      { amount: 100000000, type: 'income', accountId: 'bank', categoryId: 'salary' },
    ],
  },
  {
    name: 'category and account groups',
    message:
      'Todo con Nu:\nTransporte:\n- Uber 15000\n- Bus 3200\nAlimentación:\n- Café 7500\nTotal 25700',
    expected: [
      { amount: 1500000, categoryId: 'transport', accountId: 'nu' },
      { amount: 320000, categoryId: 'transport', accountId: 'nu' },
      { amount: 750000, categoryId: 'food', accountId: 'nu' },
    ],
  },
  {
    name: 'local account overrides shared account',
    message:
      'Hoy todo con Nu, excepto cuando diga otra cuenta:\n- Café 7500\n- Almuerzo 35k desde Bancolombia',
    expected: [
      { amount: 750000, accountId: 'nu' },
      { amount: 3500000, accountId: 'bank' },
    ],
  },
  {
    name: 'credit and cash do not share financial impact',
    message:
      'Hoy:\n- Compré mercado por 80000 con tarjeta de crédito de Nu\n- Pagué un café por 7500 de contado con Nu',
    expected: [
      { amount: 8000000, accountId: 'nu', type: 'liability' },
      { amount: 750000, accountId: 'nu', type: 'expense' },
    ],
  },
];
const chosen = process.env.AI_BATCH_EVALUATION_CASES?.split(',').map(Number);
const reportPath = resolve(
  process.env.AI_EVALUATION_REPORT ?? 'test-results/ai-batch-evaluation.json',
);
const results: unknown[] = [];
let passed = 0;
const version = await (await request(new URL('/api/version', options.baseUrl))).json();
for (const [index, item] of cases.entries()) {
  if (chosen && !chosen.includes(index + 1)) continue;
  const start = performance.now();
  let raw: unknown;
  try {
    raw = await organizeMessage(item.message, provider);
    const organized = validateOrganization(item.message, raw);
    const resolved = [];
    const issues: string[] = [];
    if (organized.items.length !== item.expected.length)
      issues.push(`Expected ${item.expected.length} operations, got ${organized.items.length}`);
    for (const [position, record] of organized.items.entries()) {
      if (record.kind !== 'transaction') {
        issues.push(`Record ${position + 1} needs review (${record.kind})`);
        continue;
      }
      const message = scopedMessage(
        record.text,
        record.context,
        accounts,
        categories,
        context.today,
      );
      const extraction = await provider.interpret(message, context);
      const proposal = resolveBatchProposal(
        extraction,
        record.text,
        record.context,
        accounts,
        categories,
        'bank',
        context.today,
      );
      for (const [key, value] of Object.entries(item.expected[position] ?? {})) {
        if (proposal[key as keyof typeof proposal] !== value)
          issues.push(
            `Record ${position + 1} ${key}: expected ${value}, got ${proposal[key as keyof typeof proposal]}`,
          );
      }
      if (extraction.intent !== 'transaction')
        issues.push(`Record ${position + 1} invalid model intent`);
      resolved.push({ record, extraction, proposal });
    }
    const success = !issues.length;
    if (success) passed++;
    results.push({
      case: index + 1,
      name: item.name,
      message: item.message,
      success,
      path: canUseSingleFlow(item.message) ? 'single' : 'organized',
      raw,
      organized,
      resolved,
      issues,
      durationMs: Math.round(performance.now() - start),
    });
    console.log(
      `${success ? 'PASS' : 'FAIL'} ${index + 1} ${item.name}: ${issues.join('; ') || 'all expected fields'}`,
    );
  } catch (error) {
    results.push({
      case: index + 1,
      name: item.name,
      message: item.message,
      success: false,
      raw,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    });
    console.log(JSON.stringify(raw));
    console.log(
      `FAIL ${index + 1} ${item.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      version,
      options,
      promptVersion: PROMPT_VERSION,
      organizerPromptVersion: ORGANIZER_PROMPT_VERSION,
      referenceDate: context.today,
      passed,
      total: results.length,
      results,
    },
    null,
    2,
  ),
);
console.log(`${passed}/${results.length} passed; report ${reportPath}`);
if (passed !== results.length) process.exitCode = 1;
