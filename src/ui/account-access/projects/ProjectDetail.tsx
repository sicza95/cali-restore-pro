/* eslint-disable solid/reactivity -- Project commands are deferred event callbacks, not render effects. */
import { createSignal, For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { newObject, newSurface, projectName } from '../../../platform/projects/projects';
import type {
  RestorationObject,
  SavedProject,
  Surface,
  Units,
} from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import { NameForm, UnitsField } from './forms';
import { ProjectOriginals } from './ProjectOriginals';
import { projectCopy } from './project-copy';

export function ProjectDetail(props: {
  project: SavedProject;
  language: Language;
  vault: LocalVault;
  busy: boolean;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (project: SavedProject) => Promise<void>;
  sharing: JSX.Element;
}) {
  const c = () => projectCopy[props.language];
  const [objectId, setObject] = createSignal('');
  const [surfaceId, setSurface] = createSignal('');
  const object = () =>
    props.project.objects.find((o) => o.id === objectId()) ?? props.project.objects[0]!;
  const surface = () =>
    object().surfaces.find((s) => s.id === surfaceId()) ?? object().surfaces[0]!;
  const units = () => surface().units ?? object().units ?? props.project.settings.units;
  const edit = (value: Partial<SavedProject>) => props.onSave({ ...props.project, ...value });
  const editObject = (value: Partial<RestorationObject>) =>
    edit({
      objects: props.project.objects.map((o) => (o.id === object().id ? { ...o, ...value } : o)),
    });
  const editSurface = (value: Partial<Surface>) =>
    editObject({
      surfaces: object().surfaces.map((s) => (s.id === surface().id ? { ...s, ...value } : s)),
    });
  return (
    <>
      <div class="project-heading">
        <h2>{props.project.name}</h2>
        <button
          class="secondary"
          disabled={props.busy}
          onClick={() => void props.onRun(() => edit({ archived: !props.project.archived }))}
        >
          {props.project.archived ? c().restore : c().archive}
        </button>
      </div>
      {props.sharing}
      <Show when={!props.project.archived}>
        <div class="project-detail">
          <section class="project-pane">
            <h3>{c().hierarchy}</h3>
            <div class="project-fields">
              <label>
                {c().object}
                <select
                  value={object().id}
                  disabled={props.busy}
                  onChange={(e) => {
                    setObject(e.currentTarget.value);
                    setSurface('');
                  }}
                >
                  <For each={props.project.objects}>
                    {(o) => (
                      <option value={o.id} selected={o.id === object().id}>
                        {o.name}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <label>
                {c().surface}
                <select
                  value={surface().id}
                  disabled={props.busy}
                  onChange={(e) => setSurface(e.currentTarget.value)}
                >
                  <For each={object().surfaces}>
                    {(s) => (
                      <option value={s.id} selected={s.id === surface().id}>
                        {s.name}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            </div>
            <NameForm
              label={c().object}
              value={object().name}
              action={c().rename}
              disabled={props.busy}
              onSubmit={(name) => props.onRun(() => editObject({ name: projectName(name) }))}
            />
            <NameForm
              label={c().surface}
              value={surface().name}
              action={c().rename}
              disabled={props.busy}
              onSubmit={(name) => props.onRun(() => editSurface({ name: projectName(name) }))}
            />
            <NameForm
              label={c().addObject}
              action={c().addObject}
              disabled={props.busy}
              onSubmit={(name) =>
                props.onRun(async () => {
                  const next = newObject(name, c().firstSurface);
                  await edit({ objects: [...props.project.objects, next] });
                  setObject(next.id);
                  setSurface('');
                })
              }
            />
            <NameForm
              label={c().addSurface}
              action={c().addSurface}
              disabled={props.busy}
              onSubmit={(name) =>
                props.onRun(async () => {
                  const next = newSurface(name);
                  await editObject({ surfaces: [...object().surfaces, next] });
                  setSurface(next.id);
                })
              }
            />
          </section>
          <section class="project-pane">
            <h3>{c().settings}</h3>
            <NameForm
              label={c().name}
              value={props.project.name}
              action={c().rename}
              disabled={props.busy}
              onSubmit={(name) => props.onRun(() => edit({ name: projectName(name) }))}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                const scope = object();
                const active = surface();
                const currency = String(fields.get('currency')).toUpperCase();
                const projectUnits = fields.getAll('units');
                void props.onRun(() =>
                  edit({
                    settings: { version: 1, currency, units: projectUnits[0] as Units },
                    objects: props.project.objects.map((o) =>
                      o.id === scope.id
                        ? {
                            ...o,
                            units: (projectUnits[1] || null) as Units | null,
                            surfaces: o.surfaces.map((s) =>
                              s.id === active.id
                                ? { ...s, units: (projectUnits[2] || null) as Units | null }
                                : s,
                            ),
                          }
                        : o,
                    ),
                  }),
                );
              }}
            >
              <label>
                {c().currency}
                <input
                  name="currency"
                  required
                  pattern="[A-Za-z]{3}"
                  maxLength={3}
                  value={props.project.settings.currency}
                />
              </label>
              <UnitsField label={c().units} copy={c()} value={props.project.settings.units} />
              <UnitsField
                label={object().name + ' · ' + c().units}
                copy={c()}
                inherit
                value={object().units}
              />
              <UnitsField
                label={surface().name + ' · ' + c().units}
                copy={c()}
                inherit
                value={surface().units}
              />
              <p>
                {surface().name} · {c()[units()]}
              </p>
              <button disabled={props.busy}>{c().save}</button>
            </form>
          </section>
        </div>
        <Show when={surface().id} keyed>
          {(id) => (
            <ProjectOriginals
              project={props.project.id}
              surface={object().surfaces.find((s) => s.id === id)!}
              copy={c()}
              vault={props.vault}
              busy={props.busy}
              onRun={props.onRun}
              onSave={(images) => editSurface({ images })}
            />
          )}
        </Show>
      </Show>
    </>
  );
}
