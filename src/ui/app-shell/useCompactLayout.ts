import { createSignal, onCleanup } from 'solid-js';

/** Below this width (iPad portrait) navigation moves into a compact header and drawer. */
export const compactQuery = '(max-width: 1100px)';

/** True while the viewport is narrower than the sidebar layout. */
export function useCompactLayout() {
  const media = window.matchMedia(compactQuery);
  const [compact, setCompact] = createSignal(media.matches);
  const update = () => setCompact(media.matches);
  media.addEventListener('change', update);
  onCleanup(() => media.removeEventListener('change', update));
  return compact;
}
