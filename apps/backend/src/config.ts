import { z } from 'zod';
import { DEFAULT_MESSAGE_LENGTH, MAX_MESSAGE_LENGTH } from './modules/ai-transactions/limits.js';
import { isLocalOllamaUrl } from './modules/ai-transactions/local-config.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  AI_TRANSACTIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OLLAMA_BASE_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:11434')
    .refine(isLocalOllamaUrl, 'Expected a local Ollama URL'),
  OLLAMA_MODEL: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default('qwen3:4b-instruct')
    .refine((value) => !/:cloud\b|-cloud\b/i.test(value), 'Cloud models are excluded'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(100).max(300_000).default(120_000),
  AI_TRANSACTIONS_MAX_MESSAGE_LENGTH: z.coerce
    .number()
    .int()
    .min(500)
    .max(MAX_MESSAGE_LENGTH)
    .default(DEFAULT_MESSAGE_LENGTH),
  OLLAMA_MODEL_LIFECYCLE: z.enum(['request', 'application']).default('request'),
  OLLAMA_KEEP_ALIVE_SECONDS: z.coerce.number().int().min(45).max(120).default(60),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(2048).max(32768).default(4096),
  OLLAMA_NUM_PREDICT: z.coerce.number().int().min(128).max(2048).default(768),
  AI_TRANSACTIONS_TIME_ZONE: z
    .string()
    .default('America/Bogota')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA time zone'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  SINGLE_USER_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  UPLOAD_DIR: z.string().default('/data/uploads'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = parsed.data;
