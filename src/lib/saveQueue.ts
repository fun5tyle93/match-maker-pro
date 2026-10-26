export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveQueueOptions<T> {
  /** Persists one value. Must throw (reject) when saving failed. */
  save: (value: T) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  /** Called after a value was saved and nothing newer is waiting. */
  onSaved?: (value: T) => void;
  onError?: (error: unknown) => void;
  /** Wait before the 1st, 2nd, ... retry; the last delay repeats. */
  retryDelaysMs?: number[];
}

export interface SaveQueue<T> {
  /** Queues the newest value. Older values that were not saved yet are dropped. */
  push(value: T): void;
  /** Tries again now instead of waiting for the next scheduled retry. */
  retryNow(): void;
  /** Drops the value that is waiting (a save that is already running is not interrupted). */
  cancelPending(): void;
  dispose(): void;
}

/**
 * Saves values one at a time, always the newest one. If saving fails the newest
 * value is kept and retried with growing delays until it works, so data is not
 * lost on a short connection problem.
 */
export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  const delays = options.retryDelaysMs ?? [2000, 5000, 15000, 30000];
  let pending: { value: T } | null = null;
  let running = false;
  let failures = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleRetry = () => {
    clearTimer();
    const delay = delays[Math.min(failures - 1, delays.length - 1)];
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delay);
  };

  async function run(): Promise<void> {
    if (running || disposed) return;
    running = true;
    try {
      while (pending && !disposed) {
        const current: { value: T } = pending;
        pending = null;
        options.onStatus('saving');
        try {
          await options.save(current.value);
          failures = 0;
          if (!pending) {
            options.onStatus('saved');
            options.onSaved?.(current.value);
          }
        } catch (error) {
          failures += 1;
          options.onError?.(error);
          // A value pushed while saving is newer, so it replaces the failed one
          if (!pending) pending = current;
          options.onStatus('error');
          scheduleRetry();
          return;
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    push(value) {
      if (disposed) return;
      pending = { value };
      // A new change is a good moment to try again right away
      clearTimer();
      void run();
    },
    retryNow() {
      clearTimer();
      void run();
    },
    cancelPending() {
      pending = null;
      clearTimer();
      failures = 0;
      if (!running) options.onStatus('idle');
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
