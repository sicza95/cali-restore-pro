import { createUniqueId, Show } from 'solid-js';
import type { Tile } from '../../../platform/projects/patterns';

export function TilePattern(props: { id: string; tile: Tile; mono?: boolean; scale?: number }) {
  const p = () => props.tile;
  const ink = () => (props.mono ? 'currentColor' : p().color);
  const s = () => p().spacing;
  const size = () => Math.min(p().size, s() - p().weight);
  const path = () => {
    const mid = s() / 2;
    switch (p().kind) {
      case 'lines':
        return 'M0 ' + mid + 'H' + s();
      case 'grid':
        return 'M0 ' + mid + 'H' + s() + ' M' + mid + ' 0V' + s();
      case 'hatch':
        return 'M0 0L' + s() + ' ' + s() + ' M0 ' + s() + 'L' + s() + ' 0';
      case 'custom': {
        const start = (s() - size()) / 2;
        return (
          'M' +
          (p().points ?? [])
            .map(([x, y]) => [start + x * size(), start + y * size()].join(' '))
            .join('L')
        );
      }
      default:
        return '';
    }
  };
  return (
    <pattern
      id={props.id}
      patternUnits="userSpaceOnUse"
      width={s()}
      height={s()}
      patternTransform={'scale(' + (props.scale ?? 1) + ') rotate(' + p().angle + ')'}
    >
      <path d={path()} stroke={ink()} stroke-width={p().weight} fill="none" />
      <Show when={p().kind === 'dots'}>
        <circle cx={s() / 2} cy={s() / 2} r={size() / 2} fill={ink()} />
      </Show>
      <Show when={p().kind === 'shapes'}>
        <rect
          x={(s() - size()) / 2}
          y={(s() - size()) / 2}
          width={size()}
          height={size()}
          fill="none"
          stroke={ink()}
          stroke-width={p().weight}
        />
      </Show>
      <Show when={p().kind === 'motif'}>
        <text
          x={s() / 2}
          y={s() / 2}
          text-anchor="middle"
          dominant-baseline="central"
          font-size={String(Math.min(size(), s() / Math.max(1, p().motif.length)))}
          fill={ink()}
        >
          {p().motif}
        </text>
      </Show>
    </pattern>
  );
}

export function TilePreview(props: { tile: Tile; mono: boolean; label: string }) {
  const id = createUniqueId();
  return (
    <svg viewBox="0 0 320 100" class="checkpoint-map" role="img" aria-label={props.label}>
      <defs>
        <TilePattern id={id} tile={props.tile} mono={props.mono} />
      </defs>
      <rect width="320" height="100" fill={`url(#${id})`} />
    </svg>
  );
}
