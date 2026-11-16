import type { SurfaceCopy } from './surface-copy';

const id = (key: string) => 'surface.review.' + key;

/** Apply, Cancel and Reset at the foot of an open review tool. */
export function SurfaceReviewActions(props: {
  copy: SurfaceCopy;
  applyDisabled: boolean;
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  return (
    <div class="surface-actions">
      <button
        class="primary"
        type="button"
        data-control-id={id('apply')}
        disabled={props.applyDisabled}
        onClick={() => props.onApply()}
      >
        {props.copy.apply}
      </button>
      <button type="button" data-control-id={id('cancel')} onClick={() => props.onCancel()}>
        {props.copy.cancel}
      </button>
      <button type="button" data-control-id={id('reset')} onClick={() => props.onReset()}>
        {props.copy.reset}
      </button>
    </div>
  );
}
