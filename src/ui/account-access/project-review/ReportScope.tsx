import { For, Show } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import type { ReportCopy } from '../../../platform/reports/copy';
import { reportControl as id } from './report-controls';
import { defaultSelection, versions } from '../../../platform/reports/types';
import type { Selection } from '../../../platform/reports/types';
import { ReviewCheck, ReviewSelect } from './fields';

export function ReportScope(props: {
  project: SavedProject;
  copy: ReportCopy;
  excluded: string[];
  toggle: (id: string) => void;
  surfaces: Record<string, Selection>;
  change: (id: string, patch: Partial<Selection>) => void;
}) {
  const c = () => props.copy;
  return (
    <section class="project-pane">
      <h3>{c().scope}</h3>
      <For each={props.project.objects}>
        {(object) => (
          <section class="review-inset">
            <ReviewCheck
              id={id('includeObject')}
              checked={!props.excluded.includes(object.id)}
              change={() => props.toggle(object.id)}
            >
              {c().includeObject} · {object.name}
            </ReviewCheck>
            <Show when={!props.excluded.includes(object.id)}>
              <For each={object.surfaces}>
                {(surface) => {
                  const selected = () => props.surfaces[surface.id] ?? defaultSelection;
                  const change = (patch: Partial<Selection>) => props.change(surface.id, patch);
                  const references = () =>
                    surface.images.filter((image) => image.role === 'reference');
                  return (
                    <div class="report-surface">
                      <ReviewCheck
                        id={id('includeSurface')}
                        checked={selected().included}
                        change={(included) => change({ included })}
                      >
                        {c().includeSurface} · {surface.name}
                      </ReviewCheck>
                      <Show when={selected().included}>
                        <div class="review-fields">
                          <ReviewSelect
                            id={id('version')}
                            label={c().version}
                            value={selected().version}
                            options={versions}
                            text={(key) => c()[key]}
                            change={(version) =>
                              change({
                                version,
                                compare: selected().compare === version ? '' : selected().compare,
                              })
                            }
                          />
                          <ReviewSelect
                            id={id('compare')}
                            label={c().compare}
                            value={selected().compare}
                            options={[
                              '',
                              ...versions.filter((version) => version !== selected().version),
                            ]}
                            text={(key) => (key ? c()[key] : c().noCompare)}
                            change={(compare) => change({ compare })}
                          />
                        </div>
                        <details class="report-references">
                          <summary data-control-id={id('references')}>{c().references}</summary>
                          <For each={references()} fallback={<p>{c().noReferences}</p>}>
                            {(photo, i) => (
                              <ReviewCheck
                                id={id('reference')}
                                checked={selected().references.includes(photo.id)}
                                change={(checked) =>
                                  change({
                                    references: checked
                                      ? [...selected().references, photo.id]
                                      : selected().references.filter((id) => id !== photo.id),
                                  })
                                }
                              >
                                {c().reference} {i() + 1}
                              </ReviewCheck>
                            )}
                          </For>
                        </details>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </section>
        )}
      </For>
    </section>
  );
}
