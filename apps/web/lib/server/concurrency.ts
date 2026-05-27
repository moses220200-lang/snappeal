/**
 * In-process semaphore. Caps the number of concurrent expensive operations
 * that block an HTTP request — Claude CLI subprocesses in particular.
 *
 * Strategy when capacity is exhausted: callers wait in a FIFO queue. With
 * 4 slots and a 30s Claude run, a burst of 10 requests serialises to
 * roughly 3 batches × 30s = 90s for the last one. Beyond ~10 in-flight we
 * should probably 429.
 */
export class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release() {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  get inFlight() {
    return this.active;
  }
  get queued() {
    return this.waiters.length;
  }
}

const GENERATE_LIMIT = Number(process.env.PARKINGRABBIT_GENERATE_CONCURRENCY ?? 4);
export const generateSemaphore = new Semaphore(GENERATE_LIMIT);
