import { createSignal } from 'solid-js';
import type { JSX } from 'solid-js';

// Module scope: the disclosure stays as the conservator left it for the rest of the session,
// across surfaces and tabs, without writing anything to storage.
const [open, setOpen] = createSignal(false);

/** The numeric fallback and save settings behind a disclosure that is closed by default. */
export function DrawingDetails(props: {
  summary: string;
  ref: (element: HTMLDetailsElement) => void;
  children: JSX.Element;
}) {
  return (
    <details
      ref={props.ref}
      class="drawing-details"
      open={open()}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{props.summary}</summary>
      {props.children}
    </details>
  );
}

/** Opens the disclosure and moves focus to its first field. */
export function openDetails(details: HTMLDetailsElement) {
  details.open = true;
  setOpen(true);
  details.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')?.focus();
}
