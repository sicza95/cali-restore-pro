import { onCleanup } from 'solid-js';

/** Long press cancels on drag, scrolling, release or unmount. Mouse uses contextmenu. */
export function useItemGesture(open: (x: number, y: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin = { x: 0, y: 0 };
  const cancel = () => clearTimeout(timer);
  onCleanup(cancel);
  return {
    onPointerDown: (event: PointerEvent) => {
      cancel();
      if (event.pointerType === 'mouse' || (event.target as Element).closest('button, input'))
        return;
      origin = { x: event.clientX, y: event.clientY };
      timer = setTimeout(() => open(origin.x, origin.y), 600);
    },
    onPointerMove: (event: PointerEvent) => {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}
