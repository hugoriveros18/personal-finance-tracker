import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from './ollama-provider.js';
import { extractionSchema } from './schemas.js';

const context = {
  accounts: [{ name: 'Bank' }],
  categories: [],
  today: '2026-10-27',
  timeZone: 'America/Bogota',
};
const options = {
  baseUrl: 'http://127.0.0.1:11434',
  model: 'arbitrary-local-model',
  timeoutMs: 1000,
  numCtx: 4096,
  numPredict: 768,
};
const extraction = {
  intent: 'transaction',
  type: 'expense',
  amountText: '35 mil',
  description: 'Lunch',
  dateText: null,
  accountMentioned: false,
  accountName: null,
  categoryName: null,
};
const wrap = (value = extraction) => {
  return { purchase: 'Lunch', transaction: value };
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('Ollama HTTP adapter', () => {
  it('sends the configured model and Zod-derived schema without identifiers or tools', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ thinking: { values: [true, false] } }))
      .mockResolvedValueOnce(
        json({
          done: true,
          message: { content: JSON.stringify(wrap()) },
        }),
      );
    expect(await new OllamaProvider(options, request).interpret('35 mil', context)).toEqual(
      extractionSchema.parse(extraction),
    );
    const body = JSON.parse(String(request.mock.calls[1]![1]!.body));
    expect(body).toMatchObject({
      model: options.model,
      stream: false,
      think: false,
      options: { num_ctx: 4096 },
      format: { type: 'object', additionalProperties: false },
    });
    expect(Object.keys(body.format.properties).sort()).toEqual(['purchase', 'transaction']);
    expect(Object.keys(body.format.properties.transaction.properties).sort()).toEqual(
      Object.keys(extractionSchema.shape).sort(),
    );
    expect(body.tools).toBeUndefined();
    expect(body.messages[1].content).not.toMatch(/accountId|userId|balance/);
  });
  it('does not send unsupported thinking controls', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(
        json({
          done: true,
          message: { content: JSON.stringify(wrap()) },
        }),
      );
    await new OllamaProvider(options, request).interpret('35 mil', context);
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).not.toHaveProperty('think');
  });
  it('discards the purchase cue and returns only the validated transaction in one generation', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      String(url).endsWith('/api/show')
        ? json({})
        : json({
            done: true,
            message: {
              content: JSON.stringify({ ...wrap(), purchase: 'A concrete product' }),
            },
          }),
    );
    const result = await new OllamaProvider(options, request).interpret('text', context);
    expect(result).toEqual(extraction);
    expect(result).not.toHaveProperty('purchase');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...wrap(), purchase: 'x'.repeat(121) },
    { ...wrap(), transaction: { ...wrap().transaction, accountId: 'invented' } },
    { ...wrap(), command: 'save' },
    { purchase: 'Lunch' },
  ])(
    'rejects malformed semantic envelopes without accepting extra commands or IDs',
    async (data) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ done: true, message: { content: JSON.stringify(data) } }));
      await expect(
        new OllamaProvider(options, request).interpret('text', context),
      ).rejects.toMatchObject({
        code: 'AI_INVALID_RESPONSE',
      });
    },
  );
  it.each(['not json', '{}', JSON.stringify({ ...extraction, accountId: 'invented' })])(
    'rejects invalid output: %s',
    async (content) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ done: true, message: { content } }));
      await expect(
        new OllamaProvider(options, request).interpret('text', context),
      ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    },
  );
  it('rejects truncated and oversized output', async () => {
    for (const body of [
      {
        done: true,
        done_reason: 'length',
        message: { content: JSON.stringify(wrap()) },
      },
      { oversized: 'x'.repeat(130_000) },
    ]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json(body));
      await expect(
        new OllamaProvider(options, request).interpret('text', context),
      ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    }
  });
  it('maps connection errors and missing models', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      new OllamaProvider(options, request).interpret('text', context),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
    request.mockReset().mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      new OllamaProvider(options, request).interpret('text', context),
    ).rejects.toMatchObject({ code: 'AI_MODEL_UNAVAILABLE' });
  });
  it('aborts a slow provider with a bounded timeout', async () => {
    const request: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      });
    await expect(
      new OllamaProvider({ ...options, timeoutMs: 15 }, request).interpret('text', context),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT', statusCode: 504 });
  });
  it('rejects cloud URLs, cloud model names and remote aliases before generation', async () => {
    const request = vi.fn<typeof fetch>();
    for (const override of [{ baseUrl: 'https://ollama.com' }, { model: 'model:cloud' }]) {
      await expect(
        new OllamaProvider({ ...options, ...override }, request).interpret('text', context),
      ).rejects.toMatchObject({ code: 'AI_MODEL_NOT_LOCAL' });
    }
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(json({ remote_host: 'https://ollama.com' }));
    await expect(
      new OllamaProvider(options, request).interpret('text', context),
    ).rejects.toMatchObject({ code: 'AI_MODEL_NOT_LOCAL' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('preloads only the configured local model with bounded retention and unloads explicitly', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ done: true }))
      .mockResolvedValueOnce(json({ done: true }));
    const provider = new OllamaProvider({ ...options, keepAliveSeconds: 60 }, request);
    await provider.warmup(new AbortController().signal);
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({
      model: options.model,
      messages: [],
      stream: false,
      keep_alive: 60,
      options: { num_ctx: 4096 },
    });
    await provider.unload();
    expect(JSON.parse(String(request.mock.calls[2]![1]!.body))).toEqual({
      model: options.model,
      messages: [],
      stream: false,
      keep_alive: 0,
    });
  });
  it('rejects unbounded request retention and remote aliases during preload', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      new OllamaProvider({ ...options, keepAliveSeconds: -1 }, request).warmup(
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'AI_INVALID_CONFIG' });
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(json({ remote_model: 'remote' }));
    await expect(
      new OllamaProvider(options, request).warmup(new AbortController().signal),
    ).rejects.toMatchObject({ code: 'AI_MODEL_NOT_LOCAL' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retains startup and generation only in explicit application mode and still supports unload', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ done: true }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(
        json({
          done: true,
          message: { content: JSON.stringify(wrap()) },
        }),
      )
      .mockResolvedValueOnce(json({ done: true }));
    const provider = new OllamaProvider({ ...options, lifecycle: 'application' }, request);
    await provider.warmup(new AbortController().signal);
    await provider.interpret('35 mil', context);
    await provider.unload();
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body)).keep_alive).toBe(-1);
    expect(JSON.parse(String(request.mock.calls[3]![1]!.body)).keep_alive).toBe(-1);
    expect(JSON.parse(String(request.mock.calls[4]![1]!.body)).keep_alive).toBe(0);
  });
  it('propagates an application cancellation to the model request', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      controller.abort();
      throw init!.signal!.reason;
    });
    await expect(
      new OllamaProvider(options, request).interpret('text', context, controller.signal),
    ).rejects.toMatchObject({ code: 'AI_INTERRUPTED' });
  });
});

describe('Ollama organization output', () => {
  it('uses the same local adapter with a bounded collection schema and larger output budget', async () => {
    const organized = {
      items: [
        {
          text: 'Uber 15k',
          kind: 'transaction',
          context: { dateText: 'Hoy', accountText: null, categoryText: null, paymentText: null },
        },
      ],
      notes: [],
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ done: true, message: { content: JSON.stringify(organized) } }));
    expect(await new OllamaProvider(options, request).organize('Hoy: Uber 15k')).toMatchObject(
      organized,
    );
    const body = JSON.parse(String(request.mock.calls[1]![1]!.body));
    expect(body.format.properties.items.maxItems).toBe(30);
    expect(body.options).toMatchObject({ num_ctx: 4096, num_predict: 2048 });
    expect(body.tools).toBeUndefined();
  });
  it('maps malformed organization to the same provider error contract', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ done: true, message: { content: '{}' } }));
    await expect(new OllamaProvider(options, request).organize('text')).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
});
