import { createMemo, createSignal, onCleanup, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import { SurfaceTiles } from './SurfaceTiles';
import type { LocalVault } from '../../../platform/vault/vault';
import type { SurfaceCopy } from './surface-copy';

export function SurfacePhoto(props: {
  vault: LocalVault;
  project: string;
  id: string;
  copy: SurfaceCopy;
  style?: JSX.CSSProperties;
  zoom?: number;
  children?: JSX.Element;
  onReady?: (size: { width: number; height: number }) => void;
}) {
  const [url, setUrl] = createSignal<string>();
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'invalid'>('loading');
  const controller = new AbortController();
  const access = untrack(() => props.vault.accessSignal());
  const files = untrack(() => props.vault.files());
  const ref = untrack(() => ({ project: props.project, id: props.id }));
  const [image, setImage] = createSignal<Awaited<ReturnType<typeof files.workingImage>>>();
  const clear = () => {
    controller.abort();
    const current = url();
    if (current) URL.revokeObjectURL(current);
    setUrl(undefined);
    setImage(undefined);
    setStatus('invalid');
  };
  access.addEventListener('abort', clear, { once: true });
  onCleanup(() => {
    access.removeEventListener('abort', clear);
    clear();
  });
  void files.workingImage(ref, { signal: controller.signal }).then(
    (value) => {
      if (controller.signal.aborted) return;
      setImage(value);
      setUrl(URL.createObjectURL(value.proxy));
    },
    () => {
      if (!controller.signal.aborted) setStatus('invalid');
    },
  );
  const level = createMemo(() => {
    const manifest = image()?.manifest;
    const zoom = props.zoom ?? 100;
    if (!manifest || zoom <= 125 || status() !== 'ready') return;
    const target = (Math.max(manifest.proxy.width, manifest.proxy.height) * zoom) / 100;
    for (let i = manifest.levels.length - 1; i >= 0; i--) {
      const { width, height } = manifest.levels[i]!;
      if (i === 0 || Math.max(width, height) >= target) return i;
    }
  });
  return (
    <>
      <Show when={status() !== 'ready'}>
        <p role="status">
          {status() === 'loading' ? props.copy.loading : props.copy.previewUnavailable}
        </p>
      </Show>
      <Show when={url() && status() !== 'invalid'}>
        <div class="surface-photo-frame" style={props.style}>
          <img
            src={url()}
            alt={props.copy.photo}
            draggable={false}
            classList={{ 'surface-photo-loading': status() === 'loading' }}
            onLoad={() => {
              setStatus('ready');
              props.onReady?.(image()!.manifest.pixels);
            }}
            onError={() => setStatus('invalid')}
          />
          <Show when={level() === undefined ? undefined : level()! + 1} keyed>
            {(number) => (
              <SurfaceTiles
                level={image()!.manifest.levels[number - 1]!}
                read={(x, y) => image()!.tile(number - 1, x, y)}
              />
            )}
          </Show>
          <Show when={status() === 'ready'}>{props.children}</Show>
        </div>
      </Show>
    </>
  );
}
