import { createEffect, createSignal, createUniqueId, onCleanup, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import type { IconName } from '../../../icon/types';

/** Local transient state only. Menu items use native buttons with menu roles. */
export function Popup(props: {
  label: string;
  icon: IconName;
  controlId: string;
  menu?: boolean;
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const id = createUniqueId();
  let root!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  let panel!: HTMLDivElement;
  const close = () => {
    setOpen(false);
    trigger.focus();
  };
  const focusAt = (index: number) => {
    const buttons = panel.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    buttons.item((index + buttons.length) % buttons.length)?.focus();
  };
  createEffect(() => {
    if (!open()) return;
    if (props.menu) queueMicrotask(() => focusAt(0));
    const outside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    onCleanup(() => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    });
  });
  return (
    <div class="browser-popup" ref={(element) => (root = element)}>
      <button
        type="button"
        class="browser-action"
        ref={(element) => (trigger = element)}
        aria-label={props.label}
        title={props.label}
        data-control-id={props.controlId}
        aria-expanded={open()}
        aria-controls={id}
        aria-haspopup={props.menu ? 'menu' : undefined}
        onClick={() => setOpen(!open())}
        onKeyDown={(event) => {
          if (props.menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
            queueMicrotask(() => focusAt(event.key === 'ArrowUp' ? -1 : 0));
          }
        }}
      >
        <Icon name={props.icon} size={18} />
        <span class="browser-action-label">{props.label}</span>
      </button>
      <Show when={open()}>
        <div
          class="browser-popup-panel"
          id={id}
          ref={(element) => (panel = element)}
          role={props.menu ? 'menu' : 'region'}
          aria-label={props.label}
          onFocusOut={(event) => {
            if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) setOpen(false);
          }}
          onClick={(event) => {
            if (props.menu && (event.target as Element).closest('[role^="menuitem"]')) close();
          }}
          onKeyDown={(event) => {
            if (!props.menu) return;
            const buttons = Array.from(
              panel.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'),
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              focusAt(
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? -1
                    : index + (event.key === 'ArrowDown' ? 1 : -1),
              );
            }
          }}
        >
          {props.children}
        </div>
      </Show>
    </div>
  );
}
