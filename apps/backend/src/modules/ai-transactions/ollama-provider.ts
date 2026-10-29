import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import {
  extractionResponseJsonSchema,
  extractionResponseSchema,
  extractionSchema,
  organizationJsonSchema,
  organizationSchema,
} from './schemas.js';
import {
  SYSTEM_PROMPT,
  ORGANIZER_PROMPT,
  type InterpretationContext,
  type InterpretationProvider,
  type ModelLifecycle,
} from './provider.js';
import { isLocalOllamaUrl } from './local-config.js';

interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  numCtx: number;
  numPredict: number;
  keepAliveSeconds?: number;
  lifecycle?: ModelLifecycle;
}

const envelopeSchema = z.object({
  done: z.literal(true),
  done_reason: z.string().optional(),
  message: z.object({ content: z.string().min(1).max(16_000) }),
});

export class OllamaProvider implements InterpretationProvider {
  constructor(
    private readonly options: OllamaOptions,
    private readonly request = fetch,
  ) {}

  private get keepAlive() {
    // Application mode is opt-in for a dedicated, explicitly started/stopped Ollama container.
    return this.options.lifecycle === 'application' ? -1 : (this.options.keepAliveSeconds ?? 60);
  }

  private async json(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(new URL(path, this.options.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        response.status === 404 ? 503 : 502,
        response.status === 404 ? 'AI_MODEL_UNAVAILABLE' : 'AI_PROVIDER_ERROR',
        'The local model could not process the request',
      );
    }
    // Bound even a chunked response before allocating/parsing its entire body.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing response');
    let length = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 128_000) throw new Error('Oversized response');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  private requireLocal() {
    if (!isLocalOllamaUrl(this.options.baseUrl) || /:cloud\b|-cloud\b/i.test(this.options.model)) {
      throw new AppError(422, 'AI_MODEL_NOT_LOCAL', 'Only local Ollama models are supported');
    }
    if (
      this.options.keepAliveSeconds !== undefined &&
      (!Number.isFinite(this.options.keepAliveSeconds) ||
        this.options.keepAliveSeconds < 45 ||
        this.options.keepAliveSeconds > 120)
    ) {
      throw new AppError(422, 'AI_INVALID_CONFIG', 'Model retention must be bounded');
    }
  }

  private async controls(signal: AbortSignal) {
    // Discover controls rather than binding behavior to particular model names.
    const metadata = await this.json('/api/show', { model: this.options.model }, signal);
    const remote = metadata as { remote_host?: unknown; remote_model?: unknown } | null;
    if (remote?.remote_host || remote?.remote_model) {
      throw new AppError(422, 'AI_MODEL_NOT_LOCAL', 'Remote model aliases are excluded');
    }
    const controls = z
      .object({
        thinking: z.object({ values: z.array(z.union([z.boolean(), z.string()])) }).optional(),
        capabilities: z.array(z.string()).optional(),
      })
      .parse(metadata);
    return controls;
  }

  async warmup(signal: AbortSignal) {
    this.requireLocal();
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs)]);
    await this.controls(bounded);
    await this.json(
      '/api/chat',
      {
        model: this.options.model,
        messages: [],
        stream: false,
        keep_alive: this.keepAlive,
        options: { num_ctx: this.options.numCtx },
      },
      bounded,
    );
  }

  async unload() {
    this.requireLocal();
    await this.json(
      '/api/chat',
      {
        model: this.options.model,
        messages: [],
        stream: false,
        keep_alive: 0,
      },
      AbortSignal.timeout(5000),
    );
  }

  async organize(message: string, signal?: AbortSignal) {
    const result = await this.generate(message, undefined, signal, true);
    return organizationSchema.parse(result);
  }

  async interpret(message: string, context: InterpretationContext, externalSignal?: AbortSignal) {
    return extractionSchema.parse(await this.generate(message, context, externalSignal));
  }

  private async generate(
    message: string,
    context?: InterpretationContext,
    externalSignal?: AbortSignal,
    organizing = false,
  ) {
    this.requireLocal();
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
    try {
      const controls = await this.controls(signal);
      const canDisableThinking = controls.thinking?.values.includes(false);
      const result = await this.json(
        '/api/chat',
        {
          model: this.options.model,
          stream: false,
          keep_alive: this.keepAlive,
          ...(canDisableThinking ? { think: false } : {}),
          format: organizing ? organizationJsonSchema : extractionResponseJsonSchema,
          options: {
            temperature: 0,
            num_ctx: this.options.numCtx,
            num_predict: organizing
              ? Math.max(2048, this.options.numPredict)
              : this.options.numPredict,
          },
          messages: [
            { role: 'system', content: organizing ? ORGANIZER_PROMPT : SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify({ context, message }) },
          ],
        },
        signal,
      );
      const envelope = envelopeSchema.parse(result);
      if (envelope.done_reason === 'length') throw new Error('Truncated output');
      const parsed: unknown = JSON.parse(envelope.message.content);
      return organizing
        ? organizationSchema.parse(parsed)
        : extractionResponseSchema.parse(parsed).transaction;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (externalSignal?.aborted)
        throw new AppError(409, 'AI_INTERRUPTED', 'Interpretation interrupted');
      if (timeout.aborted) throw new AppError(504, 'AI_TIMEOUT', 'The local model timed out');
      if (error instanceof TypeError) {
        throw new AppError(503, 'AI_UNAVAILABLE', 'Cannot connect to local Ollama');
      }
      throw new AppError(
        502,
        'AI_INVALID_RESPONSE',
        'The local model returned an invalid response',
      );
    }
  }
}
