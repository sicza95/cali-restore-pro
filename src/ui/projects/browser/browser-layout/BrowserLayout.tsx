import { Show } from 'solid-js';
import { browserCopy } from '../browser-copy';
import type { BrowserLayoutProps } from '../types';
import '../styles.css';
import { ignoresBrowserShortcuts, keyboardCommand } from '../collection/navigation';

export function BrowserLayout(props: BrowserLayoutProps) {
  return (
    <section
      class="browser-layout"
      aria-label={props.title}
      onKeyDown={(event) => {
        const command = keyboardCommand(event, ignoresBrowserShortcuts(event.target));
        if (command === 'find' && props.onFind) {
          event.preventDefault();
          props.onFind();
        }
        if (command === 'parent' && props.onParent) {
          event.preventDefault();
          props.onParent();
        }
      }}
    >
      {/* The page title (h1) is the app heading; this names the level for screen readers. */}
      <h2 class="browser-title">{props.title}</h2>
      {props.toolbar}
      <div
        class="browser-panes"
        classList={{ 'browser-panes-with-inspector': props.inspectorOpen }}
      >
        <div class="browser-content">{props.children}</div>
        <Show when={props.inspectorOpen}>
          <aside class="browser-inspector" aria-label={browserCopy[props.language].inspector}>
            {props.inspector}
          </aside>
        </Show>
      </div>
      <p class="browser-sr-only" role="status" aria-atomic="true">
        {props.announcement}
      </p>
    </section>
  );
}
