import { Show, createUniqueId } from 'solid-js';
import { Button } from '../../controls/button/Button';
import { Icon } from '../../icon/Icon';
import { referencePhoto } from '../constants';
import type { PhotoCanvasProps } from './types';

export function PhotoCanvas(props: PhotoCanvasProps) {
  const hatchId = createUniqueId();
  return (
    <div class="cr-canvas" data-detail={props.detail}>
      <Show
        when={!props.empty}
        fallback={
          <div class="cr-empty">
            <Icon name="photo" size={36} />
            <h2>Add a reference photo</h2>
            <p>Start with an overview of the surface.</p>
            <Button icon="plus" disabled title="Photo import belongs to the application">
              Choose photo
            </Button>
            <small>Import is not connected in this UI story.</small>
          </div>
        }
      >
        <div class="cr-photo-space">
          <img
            src={referencePhoto}
            alt="Conservation reference of aged blue and ochre painted plaster with branching cracks and paint loss"
            draggable={false}
          />
          <svg
            viewBox="0 0 1536 1024"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            class="cr-map-overlay"
          >
            <defs>
              <pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width="16"
                height="16"
                patternTransform="rotate(40)"
              >
                <path d="M0 0V16" stroke="#f1cf86" stroke-width="3" />
              </pattern>
            </defs>
            <Show when={props.visible.has('flaking')}>
              <path
                class="cr-mask-fill"
                d="M1320 405l23-9 27 14 23-7-8 29-27 14-16-14-16-3Zm-84 179 34-26 29 4 18-17 18 11 4 25 36 3 9 27-23 14 10 33-24 25-32-7-13 23-33-12-10-24-36 6-15-22 14-25-8-22Z"
              />
            </Show>
            <Show when={props.visible.has('lacunae')}>
              <path
                class="cr-mask-fill"
                d="m1178 673 30-15 22 12 4 28 28 8-4 29-23 16-33-9-21-27Zm158-14 20-21 29-3 17 18 22-4 13 24-15 23-32 8-21-16-23 1Z"
              />
            </Show>
            <Show when={props.visible.has('cracks')}>
              <path
                class="cr-crack-mask"
                d="M158 0 176 33 240 79 261 115 314 142 347 188 386 228 416 251M386 228 420 207 468 164 508 136 541 87 571 64 592 0M386 228 378 271 392 308 386 350 372 388 374 438 368 486"
              />
            </Show>
            <Show when={props.visible.has('cleaning')}>
              <path
                class="cr-treatment-mask"
                fill={`url(#${hatchId})`}
                d="M1020 550h405v260h-405Z"
              />
            </Show>
          </svg>
        </div>
        <div class="cr-canvas-label cr-glass">
          <span class="cr-live-dot" />
          {props.detail ? 'Crack detail' : 'Overview'}
          <span>·</span>North wall
        </div>
        <div class="cr-scale cr-glass">
          <div>
            <span>0</span>
            <span>25</span>
            <span>50 cm</span>
          </div>
          <span class="cr-scale-line" />
        </div>
        <div class="cr-canvas-caption">Illustrative reference · shared surface masks</div>
      </Show>
    </div>
  );
}
