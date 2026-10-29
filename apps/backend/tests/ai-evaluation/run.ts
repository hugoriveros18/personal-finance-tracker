import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { OllamaProvider } from '../../src/modules/ai-transactions/ollama-provider.js';
import { isLocalOllamaUrl } from '../../src/modules/ai-transactions/local-config.js';
import { PROMPT_VERSION } from '../../src/modules/ai-transactions/provider.js';
import {
  resolveProposal,
  unsupportedMessage,
} from '../../src/modules/ai-transactions/resolution.js';
import type { Extraction, Proposal } from '../../src/modules/ai-transactions/schemas.js';

interface EvaluationCase {
  message: string;
  intent: Extraction['intent'];
  expected?: Partial<Proposal>;
}
const accounts = [
  { id: 'bank', name: 'Bancolombia' },
  { id: 'cash', name: 'Efectivo' },
  { id: 'nu', name: 'Nu' },
];
const categories = [
  { id: 'food', name: 'Alimentación', type: 'expense' as const },
  { id: 'transport', name: 'Transporte', type: 'expense' as const },
  { id: 'salary', name: 'Salario', type: 'income' as const },
  { id: 'other-income', name: 'Otros ingresos', type: 'income' as const },
];
const context = {
  accounts: accounts.map(({ name }) => ({ name })),
  categories: categories.map(({ name, type }) => ({ name, type })),
  today: '2026-10-27',
  timeZone: 'America/Bogota',
};
const options = {
  baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  model: process.env.OLLAMA_MODEL ?? 'qwen3:4b-instruct',
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000),
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 4096),
  numPredict: Number(process.env.OLLAMA_NUM_PREDICT ?? 768),
};
if (!isLocalOllamaUrl(options.baseUrl)) throw new Error('Expected a local Ollama URL');
const provider = new OllamaProvider(options);
const allCases: EvaluationCase[] = JSON.parse(
  await readFile(new URL('./cases.json', import.meta.url), 'utf8'),
);
const selectedIndices = process.env.AI_EVALUATION_CASES?.split(',').map(Number);
if (
  selectedIndices?.some((index) => !Number.isInteger(index) || index < 1 || index > allCases.length)
) {
  throw new Error('AI_EVALUATION_CASES must contain comma-separated case numbers');
}
const cases = allCases.filter(
  (_item, index) => !selectedIndices || selectedIndices.includes(index + 1),
);
const reportPath = resolve(process.env.AI_EVALUATION_REPORT ?? 'test-results/ai-evaluation.json');
const results: unknown[] = [];
let passed = 0;
let applicationPassed = 0;
let modelIntentPassed = 0;
const versionResponse = await fetch(new URL('/api/version', options.baseUrl), {
  signal: AbortSignal.timeout(5000),
});
if (!versionResponse.ok) throw new Error('Ollama is unavailable');
const version: unknown = await versionResponse.json();
const tagsResponse = await fetch(new URL('/api/tags', options.baseUrl), {
  signal: AbortSignal.timeout(5000),
});
const tags = (await tagsResponse.json()) as { models?: { name: string; digest: string }[] };
const modelDigest = tags.models?.find((model) => model.name === options.model)?.digest;
for (const [index, item] of cases.entries()) {
  const start = performance.now();
  try {
    // Always call the model, even for locally guarded intents: report actual model performance.
    const extraction = await provider.interpret(item.message, context);
    const proposal =
      extraction.intent === 'transaction'
        ? resolveProposal(extraction, item.message, accounts, categories, 'bank', context.today)
        : null;
    const modelContractIssues: string[] = [];
    if (
      extraction.dateText &&
      !item.message.toLowerCase().includes(extraction.dateText.toLowerCase())
    )
      modelContractIssues.push('Date text was not copied from the message');
    if (
      extraction.accountName &&
      !item.message.toLowerCase().includes(extraction.accountName.toLowerCase())
    )
      modelContractIssues.push('Account name was not copied from the message');
    const failures: string[] = [];
    const guarded = unsupportedMessage(item.message);
    const expectedRejection = item.intent !== 'transaction';
    const actualRejection = guarded || extraction.intent !== 'transaction';
    const applicationFailures: string[] = [];
    if (actualRejection !== expectedRejection)
      applicationFailures.push('Incorrect application acceptance/rejection');
    if (extraction.intent === item.intent) modelIntentPassed++;
    if (extraction.intent !== item.intent)
      failures.push(`intent: expected ${item.intent}, got ${extraction.intent}`);
    for (const [key, expected] of Object.entries(item.expected ?? {})) {
      const actual = proposal?.[key as keyof Proposal];
      if (actual !== expected) {
        applicationFailures.push(`Incorrect ${key}`);
        failures.push(
          `${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
    const latencyMs = Math.round(performance.now() - start);
    if (!failures.length) passed++;
    if (!applicationFailures.length) applicationPassed++;
    results.push({
      ...item,
      extraction,
      proposal,
      backendGuard: guarded,
      applicationFailures,
      modelContractIssues,
      failures,
      latencyMs,
    });
    console.log(
      `${failures.length ? 'FAIL' : 'PASS'} ${index + 1}/${cases.length} (${latencyMs}ms): ${item.message}`,
    );
    if (failures.length) console.log(failures.join('; '));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ ...item, error: message, latencyMs: Math.round(performance.now() - start) });
    console.log(`FAIL ${index + 1}/${cases.length}: ${message}`);
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        options,
        ollama: version,
        modelDigest,
        promptVersion: PROMPT_VERSION,
        context,
        passed,
        applicationPassed,
        modelIntentPassed,
        selectedIndices: selectedIndices ?? null,
        completed: results.length,
        total: cases.length,
        results,
      },
      null,
      2,
    ),
  );
}
console.log(
  `Real-model evaluation: ${passed}/${cases.length} strict cases, ${modelIntentPassed}/${cases.length} model intents, ${applicationPassed}/${cases.length} application outcomes. Report: ${reportPath}`,
);
if (passed !== cases.length) process.exitCode = 1;
