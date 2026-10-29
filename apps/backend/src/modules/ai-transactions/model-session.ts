import { AppError } from '../../shared/errors.js';
import type { InterpretationProvider, ModelLifecycle } from './provider.js';

/** Residency follows the backend lifetime in application mode, with no browser heartbeats. */
export class ModelSession {
  private readonly jobs = new Set<AbortController>();
  private warming?: Promise<void>;
  private warmController?: AbortController;
  private unloading?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private ready = false;
  private used = false;
  private closed = false;

  constructor(
    private readonly provider: InterpretationProvider,
    private readonly lifecycle: ModelLifecycle = 'request',
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  private markReady() {
    this.ready = true;
    clearTimeout(this.retry);
    this.retry = undefined;
  }

  async start(): Promise<void> {
    if (this.closed || this.lifecycle !== 'application' || this.ready) return;
    if (this.warming) return this.warming;
    clearTimeout(this.retry);
    this.retry = undefined;
    const controller = new AbortController();
    this.warmController = controller;
    this.used = true;
    this.warming = Promise.resolve()
      .then(async () => {
        await this.unloading;
        if (controller.signal.aborted) return;
        await this.provider.warmup?.(controller.signal);
        if (!controller.signal.aborted) this.markReady();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.onError(error);
          // Recover after the first model download or an unavailable Ollama server.
          this.retry = setTimeout(() => {
            void this.start();
          }, 30_000);
          this.retry.unref();
        }
      })
      .finally(() => {
        this.warming = undefined;
        this.warmController = undefined;
      });
    return this.warming;
  }

  async run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed) throw new AppError(409, 'AI_INTERRUPTED', 'Application is stopping');
    const controller = new AbortController();
    this.jobs.add(controller);
    this.used = true;
    try {
      await this.unloading;
      await this.warming;
      if (controller.signal.aborted)
        throw new AppError(409, 'AI_INTERRUPTED', 'Application is stopping');
      const result = await work(controller.signal);
      this.markReady();
      return result;
    } finally {
      this.jobs.delete(controller);
      if (this.closed || this.lifecycle === 'request') await this.release();
    }
  }

  private async release() {
    if (this.jobs.size) return;
    if (this.unloading) return this.unloading;
    if (!this.used) return;
    this.used = false;
    this.ready = false;
    this.unloading = Promise.resolve()
      .then(async () => {
        await this.warming;
        await this.provider.unload?.();
      })
      .catch(this.onError)
      .finally(() => {
        this.unloading = undefined;
      });
    return this.unloading;
  }

  async close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.warmController?.abort();
    for (const controller of this.jobs) controller.abort();
    await this.warming;
    // The last interrupted request releases after acknowledging cancellation.
    await this.release();
  }
}
