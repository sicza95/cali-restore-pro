import { createUniqueId, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import '../styles.css';

/** Reuses the repository's native modal dialog, cr-dialog styles and focus-return pattern. */
export function DialogShell(props: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  let dialog!: HTMLDialogElement;
  const id = createUniqueId();
  onMount(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    const browser = returnFocus?.closest('.browser-layout');
    const itemId = returnFocus?.closest<HTMLElement>('[data-browser-item]')?.dataset.browserItem;
    dialog.showModal();
    onCleanup(() => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus();
      else if (browser?.isConnected) {
        const cells = Array.from(browser.querySelectorAll<HTMLElement>('[data-browser-item]'));
        (
          cells.find((cell) => cell.dataset.browserItem === itemId) ??
          cells.find((cell) => cell.getAttribute('aria-selected') === 'true')
        )?.focus();
      }
    });
  });
  return (
    <dialog
      ref={(element) => (dialog = element)}
      class="cr-dialog browser-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <div class="cr-dialog-heading">
        <h2 id={id}>{props.title}</h2>
        <button
          type="button"
          class="browser-action"
          aria-label={props.closeLabel}
          data-control-id="browser.dialog.close"
          onClick={() => props.onClose()}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      {props.children}
    </dialog>
  );
}
