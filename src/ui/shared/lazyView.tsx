import { createSignal, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useApp } from '../app-context/AppContext';

/**
 * A screen loaded on demand. Unlike Solid's `lazy`, it needs no `Suspense`, so the screen's own
 * resources never leak into an enclosing boundary. `preload` fetches the chunk ahead of use.
 */
export function lazyView<P extends object>(load: () => Promise<Component<P>>) {
  const [view, setView] = createSignal<Component<P>>();
  let started: Promise<void> | undefined;
  const preload = (): Promise<void> => {
    if (started) return started;
    const pending = load().then(
      (component) => void setView(() => component),
      (error: unknown) => {
        started = undefined;
        throw error;
      },
    );
    started = pending;
    return pending;
  };
  const View: Component<P> = (props) => {
    const app = useApp();
    preload().catch(() => undefined);
    return (
      <Show when={view()} fallback={<p role="status">{app.t('working')}</p>}>
        {(component) => <Dynamic component={component()} {...props} />}
      </Show>
    );
  };
  return { View, preload };
}
