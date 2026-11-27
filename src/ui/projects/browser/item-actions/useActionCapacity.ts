import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

/** Fit a prefix of actions into the toolbar; the remaining suffix lives in its overflow menu. */
export function useActionCapacity(root: () => HTMLElement, count: () => number) {
  const [visible, setVisible] = createSignal(count());
  let measure = () => {};
  onMount(() => {
    const group = root();
    const toolbar = group.parentElement!;
    measure = () => {
      const style = getComputedStyle(toolbar);
      const inFlow = Array.from(toolbar.children).filter(
        (node) => !node.classList.contains('browser-sr-only'),
      );
      const siblings = inFlow.filter(
        (node) => node !== group && !node.classList.contains('browser-toolbar-spacer'),
      );
      const fixed = siblings.reduce((sum, node) => sum + node.getBoundingClientRect().width, 0);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const gaps = parseFloat(style.columnGap) * (inFlow.length - 1);
      const available = toolbar.clientWidth - padding - fixed - gaps - 8;
      const capacity = Math.max(0, Math.floor((available - 44) / 48));
      // Archive and Estimates/reports move together first, followed by Manage, Share, etc.
      const next = capacity >= count() ? count() : Math.min(capacity, Math.max(0, count() - 2));
      const focused = document.activeElement;
      setVisible(next);
      if (focused && group.contains(focused))
        queueMicrotask(() => {
          if (!focused.isConnected)
            group
              .querySelector<HTMLButtonElement>('[data-control-id="browser.actions.overflow"]')
              ?.focus();
        });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    for (const child of toolbar.children) if (child !== group) observer.observe(child);
    void document.fonts.ready.then(measure);
    measure();
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    count();
    measure();
  });
  return visible;
}
