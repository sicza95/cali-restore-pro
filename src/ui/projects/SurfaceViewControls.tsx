import type { SurfaceCopy } from './surface-copy';

/**
 * The photo setup view row under the canvas: zoom (the non-gesture path), fit, rotate and focus,
 * and the hint that names the canvas gestures and keys.
 */
export function SurfaceViewControls(props: {
  copy: SurfaceCopy;
  disabled: boolean;
  zoom: number;
  setZoom: (zoom: number) => void;
  fit: () => void;
  rotate: () => void;
  focus: boolean;
  setFocus: (focus: boolean) => void;
  hintId: string;
}) {
  return (
    <>
      <div class="surface-actions">
        <label>
          {props.copy.zoom}
          <input
            data-control-id="surface.view.zoom"
            type="range"
            min="50"
            max="250"
            value={props.zoom}
            disabled={props.disabled}
            onInput={(e) => props.setZoom(e.currentTarget.valueAsNumber)}
          />
        </label>
        <button
          type="button"
          data-control-id="surface.view.fit"
          disabled={props.disabled}
          onClick={() => props.fit()}
        >
          {props.copy.fit}
        </button>
        <button
          type="button"
          data-control-id="surface.view.rotate"
          disabled={props.disabled}
          onClick={() => props.rotate()}
        >
          {props.copy.rotate}
        </button>
        <button
          type="button"
          data-control-id="surface.view.focus"
          aria-pressed={props.focus}
          onClick={() => props.setFocus(!props.focus)}
        >
          {props.copy.focus}
        </button>
      </div>
      <p id={props.hintId} class="surface-view-hint">
        {props.copy.gestures}
      </p>
    </>
  );
}
