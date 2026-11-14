import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { newPlanarSurface } from '../../../platform/projects/planar-state';
import type { PlanarSurface, SourceFrame } from '../../../platform/projects/planar-types';
import type { LocalVault } from '../../../platform/vault/vault';
import { DrawingReviewAdapter } from '../../editor/drawing-review/DrawingReviewAdapter';
import type { DrawingCopy } from '../../editor/drawing-review/copy';
import { SurfacePhoto } from './SurfacePhoto';
import type { SurfaceCopy } from './surface-copy';

export function SurfaceDrawing(props: {
  active: boolean;
  vault: LocalVault;
  project: string;
  photo?: string;
  reference?: string;
  referenceOnly: boolean;
  state?: PlanarSurface;
  copy: DrawingCopy;
  view: SurfaceCopy;
  busy: boolean;
  onSave: (state: PlanarSurface) => Promise<boolean>;
}) {
  const [fallback] = createResource(
    () => !props.state && props.photo !== props.reference && props.reference,
    async (id) => {
      const image = await props.vault
        .files()
        .workingImage({ project: props.project, id })
        .catch(() => undefined);
      const manifest = image?.manifest;
      if (manifest)
        return newPlanarSurface({
          id,
          ...manifest.pixels,
          embeddedPreview: manifest.embeddedPreview,
        });
    },
  );
  const [source, setSource] = createSignal<SourceFrame>();
  const main = createMemo(() => {
    const frame = source();
    if (frame && frame.id === props.reference) return newPlanarSurface(frame);
  });
  const state = createMemo(() => props.state ?? main() ?? fallback());
  return (
    <DrawingReviewAdapter
      active={props.active}
      copy={props.copy}
      state={state()}
      source={source()?.id === props.photo ? source() : undefined}
      referenceOnly={props.referenceOnly}
      busy={props.busy}
      onSave={props.onSave}
    >
      <Show when={props.photo} keyed fallback={<p>{props.copy.unavailable}</p>}>
        {(id) => (
          <SurfacePhoto
            vault={props.vault}
            project={props.project}
            id={id}
            copy={{ ...props.view, photo: props.copy.reference }}
            onManifest={(manifest) =>
              setSource({ id, ...manifest.pixels, embeddedPreview: manifest.embeddedPreview })
            }
          />
        )}
      </Show>
    </DrawingReviewAdapter>
  );
}
