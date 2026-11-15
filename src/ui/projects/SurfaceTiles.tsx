import { For, onCleanup, onMount, untrack } from 'solid-js';
import { columns, rows, tileSize } from '../../../platform/images/types';
import type { Dimensions } from '../../../platform/images/types';

export function SurfaceTiles(props: {
  level: Dimensions;
  read: (x: number, y: number) => Promise<Blob>;
}) {
  const grid = untrack(() => {
    const cols = columns(props.level);
    return Array.from({ length: cols * rows(props.level) }, (_, i) => ({
      x: i % cols,
      y: Math.floor(i / cols),
    }));
  });
  let layer: HTMLDivElement | undefined;
  let disposed = false;

  onMount(() => {
    if (!layer) return;
    const viewport = layer.closest('.surface-canvas');
    if (!viewport || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const pending = new Set<Element>();
    const urls = new Map<Element, string>();
    let running = 0;
    function release(node: HTMLElement) {
      const url = urls.get(node);
      if (!url) return;
      node.style.removeProperty('background-image');
      node.classList.remove('surface-tile-ready');
      URL.revokeObjectURL(url);
      urls.delete(node);
    }
    function schedule() {
      for (const entry of visible) {
        if (running >= 2) break;
        if (pending.has(entry) || urls.has(entry)) continue;
        const node = entry as HTMLElement;
        const { x, y } = grid[Number(node.dataset.tile)]!;
        running++;
        pending.add(entry);
        void props
          .read(x, y)
          .then(
            (blob) => {
              if (disposed || !visible.has(entry)) return;
              const url = URL.createObjectURL(blob);
              urls.set(node, url);
              node.classList.add('surface-tile-ready');
              node.style.backgroundImage = 'url("' + url + '")';
            },
            () => visible.delete(entry),
          )
          .finally(() => {
            running--;
            pending.delete(entry);
            if (!disposed) schedule();
          });
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (isIntersecting) visible.add(target);
          else {
            visible.delete(target);
            release(target as HTMLElement);
          }
        }
        schedule();
      },
      { root: viewport },
    );
    for (const tile of layer.children) observer.observe(tile);
    onCleanup(() => {
      disposed = true;
      observer.disconnect();
      for (const node of urls.keys()) release(node as HTMLElement);
    });
  });

  const percent = (value: number, edge: number) => (100 * value) / edge + '%';
  return (
    <div
      ref={(node) => {
        layer = node;
      }}
      class="surface-tile-layer"
      aria-hidden="true"
    >
      <For each={grid}>
        {({ x, y }, i) => (
          <div
            data-tile={i()}
            style={{
              left: percent(x * tileSize, props.level.width),
              top: percent(y * tileSize, props.level.height),
              width: percent(
                Math.min(tileSize, props.level.width - x * tileSize),
                props.level.width,
              ),
              height: percent(
                Math.min(tileSize, props.level.height - y * tileSize),
                props.level.height,
              ),
            }}
          />
        )}
      </For>
    </div>
  );
}
