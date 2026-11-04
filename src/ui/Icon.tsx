import type { JSX } from 'solid-js';

const paths = {
  brand: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  back: 'm14 6-6 6 6 6',
  brush: 'm14 4 6 6M9 15 20 4a2 2 0 0 0-3-3L6 12m3 3c1 4-3 7-7 6 2-1 0-4 2-6 1-1 3-1 5 0Z',
  eraser: 'm4 13 9-9a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-9 9H7l-3-3a3 3 0 0 1 0-4Zm5-5 8 8M11 20h10',
  select: 'm5 3 14 10-7 1-3 7-4-18Z',
  pen: 'm16 3 5 5-11 11-7 2 2-7L16 3Zm-11 11 5 5M14 5l5 5',
  nodes: 'M6 6h12v12H6V6Zm-2-2h4v4H4V4Zm12 0h4v4h-4V4ZM4 16h4v4H4v-4Zm12 0h4v4h-4v-4Z',
  frame: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8V8Z',
  hand: 'M8 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 5-3 6-7 6-3 0-5-3-7-6l-3-4a2 2 0 0 1 3-2l2 2Z',
  undo: 'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12',
  redo: 'm16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  photo: 'M3 5h18v15H3V5Zm0 11 5-5 5 5 3-3 5 5M16 8h.01',
  export: 'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',
  check: 'm5 12 4 4L19 6',
  offline: 'm3 3 18 18M8 8a5 5 0 0 1 9 4h1a4 4 0 0 1 1 8M6 9a5 5 0 0 0-1 10h9',
  alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeOff: 'm3 3 18 18M9 5c7-2 13 7 13 7a23 23 0 0 1-4 4M6 6a23 23 0 0 0-4 6s4 7 10 7c2 0 3 0 5-1',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  close: 'm6 6 12 12M6 18 18 6',
  layers: 'm12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6',
  measure: 'M3 8 8 3l13 13-5 5L3 8Zm4-1 2 2m1-5 2 2m-2 7 2 2m1-5 2 2m-2 7 2 2',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  lock: 'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',
  folder: 'M3 6h7l2 3h9v12H3V6Z',
} as const;

export type IconName = keyof typeof paths;

export function Icon(props: { name: IconName; size?: number; class?: string }): JSX.Element {
  return (
    <svg
      class={props.class}
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[props.name]} />
    </svg>
  );
}
