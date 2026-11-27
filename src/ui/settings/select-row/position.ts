import { onCleanup } from 'solid-js';

/** Keep a top-layer list inside the visible viewport, including zoom and nested scrolling. */
export function followSelectRow(trigger: () => HTMLElement, panel: () => HTMLElement) {
  const place = () => {
    const anchor = trigger().getBoundingClientRect();
    const menu = panel();
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8;
    const top = (viewport?.offsetTop ?? 0) + 8;
    const right = left + (viewport?.width ?? window.innerWidth) - 16;
    const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
    const width = Math.min(320, Math.max(0, right - left));
    const below = Math.max(0, bottom - anchor.bottom - 6);
    const above = Math.max(0, anchor.top - top - 6);
    const desired = Math.min(menu.scrollHeight + 2, 320);
    const upwards = below < desired && above > below;
    const height = Math.min(desired, upwards ? above : below);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(left, Math.min(anchor.right - width, right - width))}px`;
    menu.style.top = `${Math.max(top, Math.min(upwards ? anchor.top - height - 6 : anchor.bottom + 6, bottom - height))}px`;
  };
  place();
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);
  const observer = new ResizeObserver(place);
  observer.observe(trigger());
  onCleanup(() => {
    observer.disconnect();
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
    window.visualViewport?.removeEventListener('resize', place);
    window.visualViewport?.removeEventListener('scroll', place);
  });
}
