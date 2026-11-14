import { createSignal, onCleanup } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceDraft } from './surface-review-model';

type Pair = SurfaceDraft['pairOne'];

export function surfaceMatcher(vault: LocalVault, project: string) {
  const [status, setStatus] = createSignal<'matching' | 'noMatch'>();
  let abort: (() => void) | undefined;
  function cancel() {
    abort?.();
    abort = undefined;
    setStatus(undefined);
  }
  onCleanup(cancel);
  const access = vault.accessSignal();
  access.addEventListener('abort', cancel, { once: true });
  onCleanup(() => access.removeEventListener('abort', cancel));
  async function start(detail: string, reference: string, propose: (pairs: [Pair, Pair]) => void) {
    cancel();
    const controller = new AbortController();
    let worker: Worker | undefined;
    const timer = setTimeout(() => finish(null), 15_000);
    abort = () => {
      controller.abort();
      worker?.terminate();
      clearTimeout(timer);
    };
    function finish(result: [Pair, Pair] | null) {
      if (controller.signal.aborted) return;
      abort?.();
      abort = undefined;
      setStatus(result ? undefined : 'noMatch');
      if (result) propose(result);
    }
    setStatus('matching');
    try {
      const files = vault.files();
      const read = (id: string) =>
        files.workingImage({ project, id }, { signal: controller.signal });
      const [a, b] = await Promise.all([read(detail), read(reference)]);
      if (controller.signal.aborted) return;
      worker = new Worker(
        new URL('../../../platform/projects/planar-match.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (event: MessageEvent<[Pair, Pair] | null>) => finish(event.data);
      worker.onerror = () => finish(null);
      worker.postMessage({ detail: a.proxy, reference: b.proxy });
    } catch {
      finish(null);
    }
  }
  return { status, start, cancel };
}
