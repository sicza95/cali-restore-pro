import { createUniqueId } from 'solid-js';
import type { DrawingCopy } from '../editor/drawing-review/copy';
import { Icon } from '../icon/Icon';

/**
 * Editing on the surface is paused until the user acts: either the unsaved drawing could not be
 * reopened (an error: alert, "Try again"), or the assessment changed under it (a warning: status,
 * "Discard draft"). The conflict is polite because nothing is lost while it waits and it often
 * follows the user's own action, whose status an assertive alert would cut off.
 */
export function SurfaceRecoveryNotice(props: {
  failed: boolean;
  copy: DrawingCopy;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const id = createUniqueId();
  return (
    <div
      class="account-message surface-recovery"
      data-error={props.failed || undefined}
      data-warning={!props.failed || undefined}
    >
      <Icon name="alert" class="surface-recovery-icon" />
      <p id={id} role={props.failed ? 'alert' : 'status'}>
        <strong>{props.copy.recoveryPaused}</strong>{' '}
        {props.failed ? props.copy.recoveryError : props.copy.recoveryConflict}
      </p>
      <button
        class="secondary"
        disabled={props.busy}
        type="button"
        aria-describedby={id}
        onClick={() => (props.failed ? props.onRetry() : props.onDiscard())}
      >
        {props.failed ? props.copy.recoveryRetry : props.copy.discard}
      </button>
    </div>
  );
}
