import type { CDPSession, Page } from '@playwright/test';

/**
 * Desktop Chromium profiling helpers (#50). Heap and task times come from CDP
 * `Performance.getMetrics`; frame timing comes from a `requestAnimationFrame` loop in the page.
 * Numbers are provisional desktop figures; iPad Safari numbers replace them under #49.
 */

export type FrameStats = {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Frames that took longer than 33.4 ms (two refreshes at 60 Hz). */
  slowFrames: number;
  longTasks: number;
  longTaskMs: number;
};

export type Phase = {
  durationMs: number;
  heapStartMB: number;
  heapPeakMB: number;
  heapEndMB: number;
  /** CDP counters accumulated during the phase, in milliseconds. */
  scriptMs: number;
  layoutMs: number;
  styleMs: number;
  taskMs: number;
  frames?: FrameStats;
};

const MB = 1024 * 1024;
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export async function startMetrics(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return cdp;
}

async function metrics(cdp: CDPSession) {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map(({ name, value }) => [name, value])) as Record<string, number>;
}

/** Live JS heap after a forced collection, so it shows what the app keeps and not garbage. */
export async function settledHeapMB(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  return round(((await metrics(cdp)).JSHeapUsedSize ?? 0) / MB);
}

/** Installs the frame recorder. Call once per page, before the first recorded phase. */
export async function installFrameRecorder(page: Page) {
  await page.evaluate(() => {
    const state = { running: false, last: 0, deltas: [] as number[], tasks: [] as number[] };
    new PerformanceObserver((list) => {
      if (state.running) for (const entry of list.getEntries()) state.tasks.push(entry.duration);
    }).observe({ entryTypes: ['longtask'] });
    const tick = (now: number) => {
      if (!state.running) return;
      if (state.last) state.deltas.push(now - state.last);
      state.last = now;
      requestAnimationFrame(tick);
    };
    const recorder = {
      start() {
        Object.assign(state, { running: true, last: 0, deltas: [], tasks: [] });
        requestAnimationFrame(tick);
      },
      stop() {
        state.running = false;
        const sorted = [...state.deltas].sort((a, b) => a - b);
        const at = (q: number) =>
          sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
        const sum = sorted.reduce((a, b) => a + b, 0);
        return {
          frames: sorted.length,
          meanMs: sorted.length ? sum / sorted.length : 0,
          p50Ms: at(0.5),
          p95Ms: at(0.95),
          p99Ms: at(0.99),
          maxMs: sorted.at(-1) ?? 0,
          slowFrames: sorted.filter((value) => value > 33.4).length,
          longTasks: state.tasks.length,
          longTaskMs: state.tasks.reduce((a, b) => a + b, 0),
        };
      },
    };
    (window as unknown as { perfFrames: typeof recorder }).perfFrames = recorder;
  });
}

/**
 * Runs `action`, sampling the heap every 100 ms from Node (CDP, so it also sees a busy main
 * thread's last known value) and, when `frames` is set, recording frame times in the page.
 */
export async function runPhase(
  page: Page,
  cdp: CDPSession,
  action: () => Promise<void>,
  frames = false,
): Promise<Phase> {
  const before = await metrics(cdp);
  let peak = before.JSHeapUsedSize ?? 0;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      peak = Math.max(peak, (await metrics(cdp)).JSHeapUsedSize ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  if (frames)
    await page.evaluate(() =>
      (window as never as { perfFrames: { start(): void } }).perfFrames.start(),
    );
  const started = performance.now();
  await action();
  const durationMs = performance.now() - started;
  const stats = frames
    ? await page.evaluate(() =>
        (window as never as { perfFrames: { stop(): FrameStats } }).perfFrames.stop(),
      )
    : undefined;
  sampling = false;
  await sampler;
  const after = await metrics(cdp);
  peak = Math.max(peak, after.JSHeapUsedSize ?? 0);
  const ms = (name: string) => round(((after[name] ?? 0) - (before[name] ?? 0)) * 1000);
  return {
    durationMs: Math.round(durationMs),
    heapStartMB: round((before.JSHeapUsedSize ?? 0) / MB),
    heapPeakMB: round(peak / MB),
    heapEndMB: round((after.JSHeapUsedSize ?? 0) / MB),
    scriptMs: ms('ScriptDuration'),
    layoutMs: ms('LayoutDuration'),
    styleMs: ms('RecalcStyleDuration'),
    taskMs: ms('TaskDuration'),
    ...(stats && {
      frames: Object.fromEntries(
        Object.entries(stats).map(([key, value]) => [key, round(value, 2)]),
      ) as FrameStats,
    }),
  };
}
