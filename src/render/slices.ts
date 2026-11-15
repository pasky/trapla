// Sliced main-thread work: heavy 3D rebuilds are generators that `yield` between bounded steps.
// A job runs in slices of a few milliseconds, handing the thread back to input and rendering in
// between, and can be abandoned (a newer result supersedes it) without having shown anything.

/** run a sliced build to its end (synchronous callers, tests) and return its result */
export function finish<T>(job: Generator<void, T>): T {
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}

/** a MessageChannel task runs right after pending input / rendering, without setTimeout's clamping */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const queue: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => queue.shift()?.();
const nextTask = (f: () => void) => { if (channel) { queue.push(f); channel.port2.postMessage(0); } else setTimeout(f, 0); };

export interface SlicedJob { cancel(): void; readonly done: boolean }

/**
 * Run `job` in slices of at most ~`budgetMs`, then `onDone(result)` (or `onError` if it throws).
 * `cancel()` abandons it (the generator's `finally` cleans up). Slice count and busy time go to
 * `stats` if given.
 */
export function runSliced<T>(job: Generator<void, T>, onDone: (value: T) => void, onError: (e: unknown) => void,
  budgetMs = 8, stats?: { slices: number; busy: number; maxSlice: number }): SlicedJob {
  let cancelled = false, done = false;
  const step = () => {
    if (cancelled) return;
    const t0 = performance.now();
    try {
      for (;;) {
        const r = job.next();
        if (r.done) { done = true; record(t0); onDone(r.value); return; }
        if (performance.now() - t0 >= budgetMs) break;
      }
    } catch (e) { done = true; onError(e); return; }
    record(t0);
    nextTask(step);
  };
  const record = (t0: number) => {
    if (!stats) return;
    const d = performance.now() - t0;
    stats.slices++; stats.busy += d; stats.maxSlice = Math.max(stats.maxSlice, d);
  };
  nextTask(step);
  return {
    cancel() { if (!done && !cancelled) { cancelled = true; job.return(undefined as T); } },
    get done() { return done; },
  };
}
