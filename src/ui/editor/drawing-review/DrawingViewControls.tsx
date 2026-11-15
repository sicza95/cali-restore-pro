import { Button } from '../../controls/button/Button';
import { IconButton } from '../../controls/icon-button/IconButton';
import { control } from './constants';
import type { DrawingCopy } from './copy';
import { maxZoom, minZoom, zoomStep } from './canvas-zoom';
import { DrawToggle } from './DrawingFields';
import { clamp } from './geometry';

/**
 * The drawing footer: zoom out, a readout that fits the photo when pressed, zoom in, and the
 * reference-only toggle. The exact zoom field lives in "Enter by number".
 */
export function DrawingViewControls(props: {
  copy: DrawingCopy;
  /** Zoom in percent (100 is fit). */
  zoom: number;
  onZoom: (zoom: number) => void;
  original: boolean;
  onOriginal: (original: boolean) => void;
}) {
  const c = () => props.copy;
  const percent = () => Math.round(props.zoom) + ' %';
  const step = (zoomIn: boolean) =>
    props.onZoom(
      clamp(zoomIn ? props.zoom * zoomStep : props.zoom / zoomStep, minZoom * 100, maxZoom * 100),
    );
  return (
    <div class="drawing-actions drawing-workspace-view">
      <div class="drawing-zoom" role="group" aria-label={c().zoomControls}>
        <IconButton
          icon="minus"
          label={c().zoomOut}
          data-control-id={control('view.zoomOut')}
          disabled={props.zoom <= minZoom * 100}
          onClick={() => step(false)}
        />
        <Button
          class="drawing-zoom-readout"
          data-control-id={control('view.fit')}
          aria-label={c().fitShort + ' · ' + percent()}
          title={c().fitShort}
          onClick={() => props.onZoom(100)}
        >
          {percent()}
        </Button>
        <IconButton
          icon="plus"
          label={c().zoomIn}
          data-control-id={control('view.zoomIn')}
          disabled={props.zoom >= maxZoom * 100}
          onClick={() => step(true)}
        />
      </div>
      <DrawToggle
        name="view.original"
        label={c().original}
        checked={props.original}
        onValue={props.onOriginal}
      />
    </div>
  );
}
