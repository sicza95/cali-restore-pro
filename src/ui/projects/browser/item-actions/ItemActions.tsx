import { createEffect, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from '../../../icon/Icon';
import { ActionButton } from '../browser-toolbar/ActionButton';
import type { ItemAction } from './types';
import './styles.css';

export function ItemActionButtons(props: { actions: readonly ItemAction[]; label: string }) {
  return (
    <div class="browser-item-actions" role="group" aria-label={props.label}>
      <For each={props.actions.map((action) => action.id)}>
        {(id) => {
          const action = () => props.actions.find((action) => action.id === id)!;
          return (
            <ActionButton
              label={action().label}
              icon={action().icon}
              controlId={
                id === 'rename' || id === 'delete' ? 'browser.' + id : 'browser.action.' + id
              }
              reason={action().reason}
              pressed={action().checked}
              toggle={action().checked !== undefined}
              onClick={() => action().run()}
            />
          );
        }}
      </For>
    </div>
  );
}

export function ActionMenuItems(props: { actions: readonly ItemAction[] }) {
  return (
    <For each={props.actions.map((action) => action.id)}>
      {(id) => {
        const action = () => props.actions.find((action) => action.id === id)!;
        return (
          <button
            type="button"
            role={action().checked === undefined || id === 'info' ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={id === 'info' ? undefined : action().checked}
            aria-disabled={!!action().reason}
            title={action().reason}
            data-control-id={'browser.menu.' + id}
            onClick={() => {
              if (!action().reason) action().run();
            }}
          >
            <Icon name={action().icon} size={18} />
            <span>{action().label}</span>
            <Show when={action().checked !== undefined && id !== 'info'}>
              <span class="browser-switch" data-checked={action().checked} aria-hidden="true" />
            </Show>
          </button>
        );
      }}
    </For>
  );
}

export function ItemContextMenu(props: {
  x: number;
  y: number;
  label: string;
  actions: readonly ItemAction[];
  onClose: () => void;
}) {
  let panel!: HTMLDivElement;
  const previous = document.activeElement as HTMLElement | null;
  const close = () => {
    props.onClose();
    if (previous?.isConnected) previous.focus();
  };
  createEffect(() => {
    const rect = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(props.x, window.innerWidth - rect.width - 8)) + 'px';
    panel.style.top = Math.max(8, Math.min(props.y, window.innerHeight - rect.height - 8)) + 'px';
    panel.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) props.onClose();
    };
    document.addEventListener('pointerdown', outside);
    onCleanup(() => document.removeEventListener('pointerdown', outside));
  });
  return (
    <Portal>
      <div
        ref={(element) => (panel = element)}
        class="browser-context-menu browser-popup-panel"
        role="menu"
        aria-label={props.label}
        onClick={(event) => {
          if ((event.target as Element).closest('button:not([aria-disabled="true"])'))
            props.onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}
      >
        <ActionMenuItems actions={props.actions} />
      </div>
    </Portal>
  );
}
