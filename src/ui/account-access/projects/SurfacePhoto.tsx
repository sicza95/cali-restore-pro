import { createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCopy } from './surface-copy';

export function SurfacePhoto(props: {
  vault: LocalVault;
  project: string;
  id: string;
  copy: SurfaceCopy;
  style?: JSX.CSSProperties;
  onReady?: (size: { width: number; height: number }) => void;
}) {
  const [url, setUrl] = createSignal<string>();
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'invalid'>('loading');
  const controller = new AbortController();
  onCleanup(() => {
    controller.abort();
    const current = url();
    if (current) URL.revokeObjectURL(current);
  });
  const files = untrack(() => props.vault.files());
  const ref = untrack(() => ({ project: props.project, id: props.id }));
  void (async () => {
    try {
      const meta = await files.metadata(ref);
      if (!/^image\/(jpeg|png|webp|avif)$/.test(meta.type) || meta.size > 24 * 1024 ** 2) {
        setStatus('invalid');
        return;
      }
      const parts: BlobPart[] = [];
      for await (const part of files.original(ref, { signal: controller.signal })) {
        parts.push(new Uint8Array(part));
      }
      controller.signal.throwIfAborted();
      setUrl(URL.createObjectURL(new Blob(parts, { type: meta.type })));
    } catch {
      if (!controller.signal.aborted) setStatus('invalid');
    }
  })();
  return (
    <>
      <Show when={status() !== 'ready'}>
        <p role="status">
          {status() === 'loading' ? props.copy.loading : props.copy.previewUnavailable}
        </p>
      </Show>
      <Show when={url() && status() !== 'invalid'}>
        <img
          src={url()}
          alt={props.copy.photo}
          style={props.style}
          classList={{ 'surface-photo-loading': status() === 'loading' }}
          onLoad={(event) => {
            setStatus('ready');
            props.onReady?.({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
          onError={() => setStatus('invalid')}
        />
      </Show>
    </>
  );
}
