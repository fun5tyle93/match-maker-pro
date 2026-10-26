import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveQueue, SaveStatus } from '@/lib/saveQueue';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('createSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (save: (v: string) => Promise<void>, retryDelaysMs = [1000, 3000]) => {
    const statuses: SaveStatus[] = [];
    const saved: string[] = [];
    const queue = createSaveQueue<string>({
      save,
      onStatus: s => statuses.push(s),
      onSaved: v => saved.push(v),
      retryDelaysMs,
    });
    return { queue, statuses, saved };
  };

  it('saves a value and reports saving then saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { queue, statuses, saved } = setup(save);
    queue.push('a');
    await flush();
    expect(save).toHaveBeenCalledWith('a');
    expect(statuses).toEqual(['saving', 'saved']);
    expect(saved).toEqual(['a']);
  });

  it('never runs two saves at once and only saves the newest waiting value', async () => {
    let running = 0;
    let maxRunning = 0;
    const calls: string[] = [];
    let release: () => void = () => {};
    const save = vi.fn(async (v: string) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      calls.push(v);
      if (v === 'a') await new Promise<void>(r => (release = r));
      running--;
    });
    const { queue, saved } = setup(save);
    queue.push('a');
    await flush();
    queue.push('b');
    queue.push('c'); // replaces b while a is still running
    release();
    await flush();
    expect(maxRunning).toBe(1);
    expect(calls).toEqual(['a', 'c']);
    expect(saved).toEqual(['c']); // 'saved' is only reported once nothing newer waits
  });

  it('keeps the value after a failure and retries with the configured delays', async () => {
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { queue, statuses, saved } = setup(save);
    queue.push('a');
    await flush();
    expect(statuses[statuses.length - 1]).toBe('error');
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2); // 1st retry after 1000 ms
    expect(statuses[statuses.length - 1]).toBe('error');

    await vi.advanceTimersByTimeAsync(2999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3); // 2nd retry after 3000 ms
    expect(statuses[statuses.length - 1]).toBe('saved');
    expect(saved).toEqual(['a']);
    expect(save).toHaveBeenLastCalledWith('a');
  });

  it('repeats the last delay for further retries', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    const { queue } = setup(save, [1000]);
    queue.push('a');
    await flush();
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(4); // initial + retries at 1s, 2s, 3s
    queue.dispose();
  });

  it('a newer value replaces the failed one and is tried right away', async () => {
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { queue, saved } = setup(save);
    queue.push('old');
    await flush();
    queue.push('new');
    await flush();
    expect(save).toHaveBeenLastCalledWith('new');
    expect(saved).toEqual(['new']);
  });

  it('retryNow does not wait for the timer', async () => {
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { queue, saved } = setup(save, [60000]);
    queue.push('a');
    await flush();
    queue.retryNow();
    await flush();
    expect(saved).toEqual(['a']);
  });

  it('cancelPending drops the waiting value and stops retrying', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'));
    const { queue, statuses } = setup(save);
    queue.push('a');
    await flush();
    queue.cancelPending();
    await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toBe('idle');
  });

  it('does nothing after dispose', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { queue } = setup(save);
    queue.dispose();
    queue.push('a');
    await flush();
    expect(save).not.toHaveBeenCalled();
  });
});
