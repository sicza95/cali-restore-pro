import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { browserCopy } from '../browser-copy';
import { ItemTile } from '../item-tile/ItemTile';
import { ItemRow } from '../item-row/ItemRow';
import type { BrowserCollectionProps } from '../types';
import {
  ignoresBrowserShortcuts,
  keyboardCommand,
  navigationIndex,
  reconcileSelection,
} from './navigation';
import '../styles.css';

export function BrowserGrid(props: BrowserCollectionProps) {
  return <BrowserCollection {...props} grid />;
}
export function BrowserList(props: BrowserCollectionProps) {
  return <BrowserCollection {...props} grid={false} />;
}

function BrowserCollection(props: BrowserCollectionProps & { grid: boolean }) {
  let root!: HTMLDivElement;
  let previousIds: string[] = [];
  const [columns, setColumns] = createSignal(1);
  const selected = createMemo(() =>
    reconcileSelection(
      props.items.map((item) => item.id),
      props.selectedId,
      previousIds,
    ),
  );
  createEffect(() => {
    const id = selected();
    previousIds = props.items.map((item) => item.id);
    if (id !== props.selectedId) props.onSelect(id);
  });
  // Keep row/cell identities while status and preview descriptors refresh. Replacing a
  // focused cell during an async refresh would send the next key to the document instead.
  const rows = createMemo(
    () => {
      const size = props.grid ? columns() : 1;
      const ids = props.items.map((item) => item.id);
      const result: string[][] = [];
      for (let index = 0; index < ids.length; index += size)
        result.push(ids.slice(index, index + size));
      return result;
    },
    undefined,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
  onMount(() => {
    const resize = () => setColumns(Math.max(1, Math.floor((root.clientWidth + 24) / 200)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  const focus = (index: number) => {
    const item = props.items[index];
    if (!item) return;
    props.onSelect(item.id);
    const cell = Array.from(root.querySelectorAll<HTMLElement>('[data-browser-item]')).find(
      (el) => el.dataset.browserItem === item.id,
    );
    cell?.focus();
  };
  const keydown = (event: KeyboardEvent) => {
    const typing = ignoresBrowserShortcuts(event.target);
    const nativeAction = event.target instanceof Element && !!event.target.closest('button, a');
    const command = keyboardCommand(event, typing);
    const item = props.items.find((entry) => entry.id === selected());
    if (command) {
      if (nativeAction && command !== 'find' && command !== 'parent') return;
      event.preventDefault();
      if (command === 'find') props.onFind();
      else if (command === 'parent') props.onParent?.();
      else if (item && item.access !== 'directory') {
        if (command === 'open') props.onOpen(item.id);
        if (command === 'rename' && item.access === 'editable' && !props.renameDisabledReason)
          props.onRename(item.id);
        if (command === 'delete' && item.access === 'editable' && !props.deleteDisabledReason)
          props.onDelete(item.id);
      }
      return;
    }
    if (
      typing ||
      nativeAction ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (!props.grid && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const next = navigationIndex(
      event.key,
      props.items.findIndex((entry) => entry.id === selected()),
      props.items.length,
      props.grid ? columns() : 1,
    );
    if (next !== null) {
      event.preventDefault();
      focus(next);
    }
  };
  return (
    <>
      <p class="browser-results" role="status">
        {browserCopy[props.language].results(props.items.length)}
      </p>
      <div
        ref={(element) => (root = element)}
        class={props.grid ? 'browser-grid' : 'browser-list'}
        role="grid"
        aria-label={browserCopy[props.language].levels[props.items[0]?.kind ?? 'project']}
        aria-rowcount={rows().length + (props.grid ? 0 : 1)}
        aria-colcount={props.grid ? columns() : 1}
        onKeyDown={keydown}
      >
        <Show when={!props.grid}>
          <div role="row" class="browser-list-header">
            <div role="columnheader">
              <span>{browserCopy[props.language].name}</span>
            </div>
          </div>
        </Show>
        <For each={rows()}>
          {(row) => (
            <div
              role="row"
              class={props.grid ? 'browser-grid-row' : 'browser-list-group'}
              style={
                props.grid ? { 'grid-template-columns': `repeat(${columns()}, 176px)` } : undefined
              }
            >
              <For each={row}>
                {(id) => {
                  const item = createMemo(() => props.items.find((entry) => entry.id === id)!);
                  const common = {
                    get language() {
                      return props.language;
                    },
                    get item() {
                      return item();
                    },
                    get preview() {
                      return props.previews?.[id];
                    },
                    get modifiedLabel() {
                      return props.modifiedLabels?.[id];
                    },
                    get selected() {
                      return selected() === id;
                    },
                    get tabIndex(): 0 | -1 {
                      return selected() === id ? 0 : -1;
                    },
                    onSelect: () => props.onSelect(id),
                    onOpen: () => props.onOpen(id),
                  };
                  return props.grid ? <ItemTile {...common} /> : <ItemRow {...common} />;
                }}
              </For>
            </div>
          )}
        </For>
      </div>
      <p class="browser-sr-only" aria-live="polite" aria-atomic="true">
        {props.items.find((item) => item.id === selected())
          ? browserCopy[props.language].selected(
              props.items.find((item) => item.id === selected())!.name,
            )
          : ''}
      </p>
    </>
  );
}
