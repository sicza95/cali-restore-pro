/** Shared roving-focus behavior for toolbars and tablists; selection remains explicit. */
export function moveFocus(event: KeyboardEvent, container: HTMLElement, selector: string) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return;
  }
  const controls = Array.from(container.querySelectorAll<HTMLButtonElement>(selector)).filter(
    (control) => !control.disabled,
  );
  if (!controls.length) return;
  event.preventDefault();
  const current = controls.findIndex((control) => control === document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + controls.length) %
          controls.length;
  controls[next]?.focus();
}
