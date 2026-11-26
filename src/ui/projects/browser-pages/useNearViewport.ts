import { createSignal, onCleanup, onMount } from 'solid-js';

/** How far below the visible content a tile starts loading its thumbnails and checks. */
const margin = '320px';

/**
 * The IDs of browser items that have come near the visible part of the collection, so previews
 * and originals checks load for those only rather than for every item on the level. The set
 * only grows: a tile scrolled past keeps what it loaded. Without IntersectionObserver every item
 * counts as near.
 */
export function useNearViewport(): (id: string) => boolean {
  const [near, setNear] = createSignal<ReadonlySet<string>>(new Set());
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined')
    return () => true;
  const observers = new Map<Element | null, IntersectionObserver>();
  const watched = new WeakSet<Element>();
  const seen = (entries: IntersectionObserverEntry[]) => {
    const found = entries
      .filter((entry) => entry.isIntersecting)
      .map((entry) => (entry.target as HTMLElement).dataset.browserItem)
      .filter((id): id is string => !!id && !near().has(id));
    if (found.length) setNear((current) => new Set([...current, ...found]));
  };
  // The collection scrolls inside its own pane, so that pane is the root the margin applies to.
  const observer = (root: Element | null) => {
    let found = observers.get(root);
    if (!found) {
      found = new IntersectionObserver(seen, { root, rootMargin: margin });
      observers.set(root, found);
    }
    return found;
  };
  const scan = () => {
    for (const element of document.querySelectorAll('[data-browser-item]')) {
      if (watched.has(element)) continue;
      watched.add(element);
      observer(element.closest('.browser-content')).observe(element);
    }
  };
  const mutations = new MutationObserver(scan);
  onMount(() => {
    mutations.observe(document.body, { childList: true, subtree: true });
    scan();
  });
  onCleanup(() => {
    mutations.disconnect();
    for (const entry of observers.values()) entry.disconnect();
    observers.clear();
  });
  return (id) => near().has(id);
}
