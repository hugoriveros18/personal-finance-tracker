import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OllamaProvider } from '../../src/modules/ai-transactions/ollama-provider.js';
import {
  SYSTEM_PROMPT,
  ORGANIZER_PROMPT,
  PROMPT_VERSION,
} from '../../src/modules/ai-transactions/provider.js';
import { organizationJsonSchema } from '../../src/modules/ai-transactions/schemas.js';
import { resolveProposal } from '../../src/modules/ai-transactions/resolution.js';
import { dockerFetch } from './docker-fetch.js';
import type { Extraction } from '../../src/modules/ai-transactions/schemas.js';

const categories = [
  { id: 'market', name: 'Mercado', type: 'expense' as const },
  { id: 'transport', name: 'Transporte', type: 'expense' as const },
  { id: 'utilities', name: 'Servicios Públicos', type: 'expense' as const },
  { id: 'rent', name: 'Arriendo', type: 'expense' as const },
  { id: 'restaurants', name: 'Restaurantes', type: 'expense' as const },
  { id: 'health', name: 'Salud', type: 'expense' as const },
  { id: 'education', name: 'Educación', type: 'expense' as const },
  { id: 'entertainment', name: 'Entretenimiento', type: 'expense' as const },
  { id: 'clothing', name: 'Ropa', type: 'expense' as const },
  { id: 'subscriptions', name: 'Suscripciones', type: 'expense' as const },
  { id: 'home', name: 'Hogar', type: 'expense' as const },
  { id: 'salary', name: 'Salario', type: 'income' as const },
];
const accounts = [
  { id: 'bank', name: 'Bancolombia' },
  { id: 'second', name: 'Davivienda' },
  { id: 'nu', name: 'Nu' },
];
const options = {
  baseUrl:
    process.env.OLLAMA_BASE_URL ??
    (process.env.AI_EVALUATION_DOCKER === '1' ? 'http://ollama:11434' : 'http://127.0.0.1:11434'),
  model: process.env.OLLAMA_MODEL ?? 'qwen3:4b-instruct',
  timeoutMs: 120000,
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
  numPredict: Number(process.env.OLLAMA_NUM_PREDICT ?? 768),
};
const transport = process.env.AI_EVALUATION_DOCKER === '1' ? dockerFetch : fetch;
const override = process.env.AI_QUALITY_PROMPT_FILE
  ? await readFile(process.env.AI_QUALITY_PROMPT_FILE, 'utf8')
  : null;
const metrics: unknown[] = [];
const request: typeof fetch = async (url, init) => {
  let forwarded = init;
  if (override && String(url).endsWith('/api/chat') && init?.body) {
    const body = JSON.parse(String(init.body));
    if (body.messages?.[0]?.content === SYSTEM_PROMPT) body.messages[0].content = override;
    forwarded = { ...init, body: JSON.stringify(body) };
  }
  const response = await transport(url, forwarded);
  if (String(url).endsWith('/api/chat') && response.ok) {
    const raw = (await response.clone().json()) as Record<string, unknown>;
    metrics.push({
      promptTokens: raw.prompt_eval_count,
      outputTokens: raw.eval_count,
      durationNs: raw.total_duration,
    });
  }
  return response;
};
const provider = new OllamaProvider(options, request);
const cases: {
  message: string;
  category?: string | null;
  reverse?: boolean;
  date?: string;
  intent?: Extraction['intent'];
  type?: Extraction['type'];
}[] = [
  { message: 'Compre un juego de PS5 llamado Spiderman por 215000', category: 'entertainment' },
  {
    message: 'Compre un juego de PS5 llamado Spiderman por 215000',
    category: 'entertainment',
    reverse: true,
  },
  { message: 'Compré arroz, huevos y leche para la semana por 85000', category: 'market' },
  { message: 'Pagué dos entradas para el cine por 42000', category: 'entertainment' },
  { message: 'Gasté 15000 en Uber para ir a casa', category: 'transport' },
  { message: 'Pagué 120000 de la factura de electricidad', category: 'utilities' },
  { message: 'Pagué 900000 del arriendo de mi apartamento', category: 'rent' },
  {
    message: 'Recibí mi salario por 2500000 el 26 de Octubre',
    category: 'salary',
    date: '2026-10-26',
  },
  {
    message: 'Compré mercado por 80000 con tarjeta de crédito de Nu',
    category: 'market',
    type: 'liability',
  },
  {
    message: 'Compré comida por 35000 con tarjeta de débito de Nu',
    type: 'expense',
  },
  { message: 'Pagué 100000 a mi tarjeta de crédito', intent: 'unsupported' },
  { message: 'Transferí 35000 de Bancolombia a Nu', intent: 'unsupported' },
  { message: 'Compré café por 7500 y almuerzo por 35000', intent: 'multiple' },
];
const selected = process.env.AI_QUALITY_CASES?.split(',').map(Number);
if (selected?.some((index) => !Number.isInteger(index) || index < 1 || index > cases.length)) {
  throw new Error('AI_QUALITY_CASES must contain comma-separated case numbers');
}
const results: unknown[] = [];
let passed = 0;
for (const [index, item] of cases.entries()) {
  if (process.env.AI_QUALITY_BUDGET_ONLY === '1' || (selected && !selected.includes(index + 1)))
    continue;
  const available = item.reverse ? [...categories].reverse() : categories;
  const context = {
    accounts: accounts.map(({ name }) => ({ name })),
    categories: available.map(({ name, type }) => ({ name, type })),
    today: '2026-10-28',
    timeZone: 'America/Bogota',
  };
  const started = performance.now();
  try {
    const extraction = await provider.interpret(item.message, context);
    const proposal =
      extraction.intent === 'transaction'
        ? resolveProposal(extraction, item.message, accounts, available, 'nu', context.today)
        : null;
    const success =
      extraction.intent === (item.intent ?? 'transaction') &&
      (item.category === undefined || proposal?.categoryId === item.category) &&
      (!item.date || proposal?.date === item.date) &&
      (!item.type || proposal?.type === item.type);
    if (success) passed++;
    results.push({
      case: index + 1,
      ...item,
      extraction,
      proposal,
      success,
      metrics: metrics.at(-1),
      durationMs: Math.round(performance.now() - started),
    });
    console.log(
      `${success ? 'PASS' : 'FAIL'} ${index + 1}: intent=${extraction.intent}, category=${proposal?.categoryId}, date=${proposal?.date}`,
    );
  } catch (error) {
    results.push({
      case: index + 1,
      ...item,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`FAIL ${index + 1}: ${String(error)}`);
  }
}
const budgets = [];
if (process.env.AI_MEASURE_INPUT_BUDGET === '1') {
  const sentence = 'El 26 de octubre gasté 15000 pesos en una compra desde mi cuenta Nu.\n';
  for (const length of [1000, 2000, 3000, 6000]) {
    const message = sentence.repeat(Math.ceil(length / sentence.length)).slice(0, length);
    const response = await transport(new URL('/api/chat', options.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        think: false,
        keep_alive: 60,
        format: organizationJsonSchema,
        options: { num_ctx: options.numCtx, num_predict: 1, temperature: 0 },
        messages: [
          { role: 'system', content: ORGANIZER_PROMPT },
          { role: 'user', content: JSON.stringify({ message }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Budget probe failed ${response.status}`);
    const data = (await response.json()) as Record<string, unknown>;
    budgets.push({
      characters: length,
      promptTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      doneReason: data.done_reason,
    });
    console.log(`BUDGET ${length} chars: ${data.prompt_eval_count} prompt tokens`);
  }
}
const file = resolve(process.env.AI_EVALUATION_REPORT ?? 'test-results/ai-quality-evaluation.json');
await mkdir(dirname(file), { recursive: true });
await writeFile(
  file,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      model: options.model,
      promptVersion: override ? 'override' : PROMPT_VERSION,
      prompt: override ?? SYSTEM_PROMPT,
      contextTokens: options.numCtx,
      passed,
      total: results.length,
      results,
      budgets,
    },
    null,
    2,
  ),
);
console.log(`${passed}/${results.length} passed; ${file}`);
if (passed !== results.length) process.exitCode = 1;
