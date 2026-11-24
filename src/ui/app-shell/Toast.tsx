import { createSignal } from 'solid-js';
import { Icon } from '../icon/Icon';
import './toast.css';

/** How long a toast stays: errors get longer to be read. */
export const toastDuration = { info: 5000, error: 9000 } as const;

/**
 * One floating message above everything else, so it never pushes the page. The bar shows the time
 * left; hovering or focusing the toast pauses it, and the close button ends it at once. The bar's
 * CSS animation is the timer, so pausing it pauses the countdown too.
 */
export function Toast(props: {
  text: string;
  error: boolean;
  closeLabel: string;
  dismiss: () => void;
}) {
  const [paused, setPaused] = createSignal(false);
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const sync = () => setPaused(hovered() || focused());
  return (
    <div
      class="toast"
      data-error={props.error || undefined}
      data-paused={paused() || undefined}
      style={{ '--toast-duration': `${props.error ? toastDuration.error : toastDuration.info}ms` }}
      onPointerEnter={() => {
        setHovered(true);
        sync();
      }}
      onPointerLeave={() => {
        setHovered(false);
        sync();
      }}
      onFocusIn={() => {
        setFocused(true);
        sync();
      }}
      onFocusOut={() => {
        setFocused(false);
        sync();
      }}
    >
      <Icon name={props.error ? 'alert' : 'check'} size={20} />
      <p class="toast-text" role={props.error ? 'alert' : 'status'}>
        {props.text}
      </p>
      <button
        type="button"
        class="toast-close"
        data-control-id="app.toast.close"
        aria-label={props.closeLabel}
        title={props.closeLabel}
        onClick={() => props.dismiss()}
      >
        <Icon name="close" size={18} />
      </button>
      <span class="toast-time" aria-hidden="true" onAnimationEnd={() => props.dismiss()} />
    </div>
  );
}
