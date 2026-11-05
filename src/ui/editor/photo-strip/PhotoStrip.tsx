import { For } from 'solid-js';
import { photoViews } from './constants';
import { referencePhoto } from '../constants';
import type { PhotoStripProps } from './types';

export function PhotoStrip(props: PhotoStripProps) {
  return (
    <div class="cr-photo-strip" role="group" aria-label="Photo views">
      <For each={photoViews}>
        {(photo) => (
          <button
            type="button"
            class="cr-photo-thumbnail"
            data-detail={photo.detail}
            aria-pressed={props.detail === photo.detail}
            onClick={() => props.onChange(photo.detail)}
          >
            <img src={referencePhoto} alt="" />
            <span>{photo.name}</span>
          </button>
        )}
      </For>
    </div>
  );
}
