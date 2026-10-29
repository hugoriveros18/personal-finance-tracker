import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelSession } from './model-session.js';
import type { ModelLifecycle } from './provider.js';

const sessions: ModelSession[] = [];
function fixture(lifecycle: ModelLifecycle = 'application') {
  vi.useFakeTimers();
  const provider = {
    interpret: vi.fn(),
    warmup: vi.fn(async (_signal: AbortSignal) => {}),
    unload: vi.fn(async () => {}),
  };
  const onError = vi.fn();
  const session = new ModelSession(provider, lifecycle, onError);
  sessions.push(session);
  return { session, provider, onError };
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
  vi.useRealTimers();
});

describe('Backend model lifecycle', () => {
  it('preloads once at startup and retains the model across requests and idle periods', async () => {
    const { session, provider } = fixture();
    await Promise.all([session.start(), session.start()]);
    expect(provider.warmup).toHaveBeenCalledTimes(1);
    expect(await session.run(async () => 'first')).toBe('first');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(await session.run(async () => 'second')).toBe('second');
    expect(provider.unload).not.toHaveBeenCalled();
    expect(provider.warmup).toHaveBeenCalledTimes(1);
    await session.close();
    expect(provider.unload).toHaveBeenCalledTimes(1);
    await session.close();
    expect(provider.unload).toHaveBeenCalledTimes(1);
  });
  it('retries a missing model at bounded intervals and stops retrying after successful preload', async () => {
    const { session, provider, onError } = fixture();
    provider.warmup.mockRejectedValueOnce(new Error('Model not downloaded'));
    await session.start();
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(provider.warmup).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.warmup).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(provider.warmup).toHaveBeenCalledTimes(2);
  });
  it('cancels scheduled warmup retries when the application stops', async () => {
    const { session, provider } = fixture();
    provider.warmup.mockRejectedValue(new Error('Ollama unavailable'));
    await session.start();
    await session.close();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(provider.warmup).toHaveBeenCalledTimes(1);
    await expect(session.run(async () => 'late')).rejects.toMatchObject({ code: 'AI_INTERRUPTED' });
  });
  it('waits for the initial preload before interpreting', async () => {
    const { session, provider } = fixture();
    let finish!: () => void;
    provider.warmup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const starting = session.start();
    await flush();
    const work = vi.fn(async () => 'ready');
    const running = session.run(work);
    await flush();
    expect(work).not.toHaveBeenCalled();
    finish();
    await starting;
    expect(await running).toBe('ready');
  });
  it('aborts in-flight work during shutdown and unloads after cancellation', async () => {
    const { session, provider } = fixture();
    await session.start();
    let signal: AbortSignal | undefined;
    const running = session.run((current) => {
      signal = current;
      return new Promise((_resolve, reject) =>
        current.addEventListener('abort', () => reject(new Error('stopped')), { once: true }),
      );
    });
    const rejected = expect(running).rejects.toThrow('stopped');
    await flush();
    await session.close();
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(provider.unload).toHaveBeenCalledTimes(1);
  });
  it('aborts startup warmup and unloads its late result on shutdown', async () => {
    const { session, provider } = fixture();
    provider.warmup.mockImplementation(
      (signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
    void session.start();
    await flush();
    await session.close();
    expect(provider.warmup.mock.calls[0]![0].aborted).toBe(true);
    expect(provider.unload).toHaveBeenCalledTimes(1);
  });
  it('does not preload in request mode and releases after the last concurrent request', async () => {
    const { session, provider } = fixture('request');
    await session.start();
    expect(provider.warmup).not.toHaveBeenCalled();
    let finish!: () => void;
    const slow = session.run(
      () =>
        new Promise((resolve) => {
          finish = () => resolve('slow');
        }),
    );
    await flush();
    expect(await session.run(async () => 'fast')).toBe('fast');
    expect(provider.unload).not.toHaveBeenCalled();
    finish();
    expect(await slow).toBe('slow');
    expect(provider.unload).toHaveBeenCalledTimes(1);
  });
  it('releases a failed request and tolerates an unavailable unload endpoint', async () => {
    const { session, provider, onError } = fixture('request');
    provider.unload.mockRejectedValueOnce(new Error('Provider stopped'));
    await expect(
      session.run(async () => {
        throw new Error('Interpretation failed');
      }),
    ).rejects.toThrow('Interpretation failed');
    expect(provider.unload).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
