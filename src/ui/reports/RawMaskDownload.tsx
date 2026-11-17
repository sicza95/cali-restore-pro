import { createMemo, createSignal, Show } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { assessmentVersions, selectAssessment } from '../../platform/projects/assessment-selection';
import type { SavedProject } from '../../platform/projects/types';
import type { LocalVault } from '../../platform/vault/vault';
import type { Language } from '../../platform/i18n/language';
import { rawMaskExport } from '../../platform/reports/raw-mask';
import { ReviewSelect } from '../project-review/fields';
import { rawMaskCopy } from './raw-mask-copy';
import { useReportDownload } from './useReportDownload';

export function RawMaskDownload(props: {
  project: SavedProject;
  vault: LocalVault;
  language: Language;
}) {
  const c = () => rawMaskCopy[props.language];
  const surfaces = createMemo(() =>
    props.project.objects.flatMap((object) =>
      object.surfaces.map((surface) => ({ surface, name: object.name + ' / ' + surface.name })),
    ),
  );
  const [surfaceId, setSurface] = createSignal('');
  const [version, setVersion] = createSignal('current');
  const [layerId, setLayer] = createSignal('');
  const surface = () =>
    surfaces().find(({ surface }) => surface.id === surfaceId())?.surface ?? surfaces()[0]?.surface;
  const state = () => surface() && selectAssessment(surface()!, version())?.state;
  const layers = () => state()?.layers ?? [];
  const selectedLayer = () => layers().find(({ id }) => id === layerId()) ?? layers()[0];
  let projectId = '';
  let revision = -1;
  const download = useReportDownload(
    () => props.vault,
    () => props.project.id === projectId && props.project.revision === revision,
  );
  function save() {
    const assessment = state();
    const layer = selectedLayer();
    if (!assessment || !layer) return;
    projectId = props.project.id;
    revision = props.project.revision;
    // Copy the selected geometry only; Solid stores cannot be posted to a worker.
    void download.download(() => structuredClone(rawMaskExport(unwrap(assessment), layer.id)));
  }
  const reset = () => {
    download.cancel();
    setLayer('');
  };
  return (
    <section class="project-pane" aria-label={c().title}>
      <h2>{c().title}</h2>
      <p class="review-note">{c().note}</p>
      <div class="review-fields">
        <ReviewSelect
          id="report.raw.surface"
          label={c().surface}
          value={surface()?.id ?? ''}
          options={surfaces().map(({ surface }) => surface.id)}
          text={(id) => surfaces().find(({ surface }) => surface.id === id)!.name}
          change={(id) => {
            reset();
            setSurface(id);
            setVersion('current');
          }}
        />
        <ReviewSelect
          id="report.raw.version"
          label={c().version}
          value={version()}
          options={surface() ? assessmentVersions(surface()!) : []}
          text={(id) => (id === 'current' ? c().current : selectAssessment(surface()!, id)!.name!)}
          change={(id) => {
            reset();
            setVersion(id);
          }}
        />
        <ReviewSelect
          id="report.raw.layer"
          label={c().layer}
          value={selectedLayer()?.id ?? ''}
          options={layers().map(({ id }) => id)}
          text={(id) =>
            state()
              ?.drawing?.find((row) => (row.key ?? String(row.id)) === id)
              ?.name.trim() || c().layer + ' ' + (layers().findIndex((row) => row.id === id) + 1)
          }
          change={(id) => {
            download.cancel();
            setLayer(id);
          }}
        />
      </div>
      <Show when={!selectedLayer()}>
        <p>{c().empty}</p>
      </Show>
      <div class="review-actions">
        <button
          type="button"
          data-control-id="report.raw.download"
          disabled={!selectedLayer() || download.working()}
          onClick={save}
        >
          {c().download}
        </button>
        <Show when={download.working()}>
          <button type="button" data-control-id="report.raw.cancel" onClick={download.cancel}>
            {c().cancel}
          </button>
        </Show>
      </div>
      <Show when={download.working()}>
        <p role="status">{c().working}</p>
      </Show>
      <Show when={download.failed()}>
        <p role="alert">{c().failed}</p>
      </Show>
    </section>
  );
}
