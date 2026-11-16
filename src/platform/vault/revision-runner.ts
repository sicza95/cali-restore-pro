// Background retry for queued revisions: runs while online, backs off from 1 s to 60 s while
// writes keep failing, and stops with the vault's signal. `wake` asks an active runner for an
// immediate pass; it does nothing while no runner is started.
export function retryRunner(
  signal: AbortSignal,
  pending: () => Promise<boolean>,
  retry: (csrf: string) => Promise<boolean>,
) {
  let schedule: ((delay: number) => void) | undefined;

  function start(getCsrf: () => Promise<string>, onError: (error: unknown) => void) {
    signal.throwIfAborted();
    if (schedule) throw new Error('Retry runner is already active');
    let timer: ReturnType<typeof setTimeout>;
    let delay = 1000;
    let stopped = false;
    const wake = () => schedule?.(0);
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      signal.removeEventListener('abort', stop);
      schedule = undefined;
    };
    async function run() {
      try {
        if (stopped || !navigator.onLine) return;
        if (!(await pending())) return;
        const csrf = await getCsrf();
        if (stopped) return;
        if (await retry(csrf)) {
          if (!stopped) schedule?.(delay);
          delay = Math.min(delay * 2, 60_000);
        } else {
          delay = 1000;
        }
      } catch (error) {
        if (!stopped) {
          onError(error);
          if (!stopped) schedule?.(delay);
          delay = Math.min(delay * 2, 60_000);
        }
      }
    }
    schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), ms);
    };
    window.addEventListener('online', wake);
    signal.addEventListener('abort', stop, { once: true });
    wake();
    return () => {
      if (!stopped) stop();
    };
  }

  return { start, wake: () => schedule?.(0) };
}
