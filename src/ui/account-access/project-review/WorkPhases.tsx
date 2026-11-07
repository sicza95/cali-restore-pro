import { createSignal, For, Show, untrack } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import { followProjectLink, projectHref } from '../projects/project-route';
import type { EstimateCopy } from './estimate-copy';
import { phaseControl as id } from './estimate-controls';
import { ReviewSelect } from './fields';
import { PhaseInputs } from './PhaseInputs';
import type { Phase, PhaseModel } from './estimate-model';

function PhaseDetails(props: {
  copy: EstimateCopy;
  model: PhaseModel;
  phase: Phase;
  project: SavedProject;
  navigate: (href: string) => void;
}) {
  const c = () => props.copy;
  const p = () => props.phase;
  const m = untrack(() => props.model);
  const [combine, setCombine] = createSignal('');
  const [clone, setClone] = createSignal('');
  const others = () =>
    m.active().filter((row) => row.id !== p().id && row.surface && row.surface === p().surface);
  const cloneSources = () => others().filter((row) => row.scope);
  const selected = () => others().find((row) => row.id === combine());
  const cloneSource = () => cloneSources().find((row) => row.id === clone());
  const order = () => m.active().findIndex((row) => row.id === p().id);
  const surfaces = () =>
    props.project.objects.flatMap((object) =>
      object.surfaces.map((surface) => ({
        id: surface.id,
        label: object.name + ' / ' + surface.name,
      })),
    );
  const href = () => projectHref(props.project.id, p().surface);
  const update = (change: Partial<Phase>) => m.update(p().id, change);
  return (
    <>
      <label>
        {c().name}
        <input
          data-control-id={id('name')}
          value={p().name}
          maxlength="80"
          required
          aria-invalid={!p().name.trim() || undefined}
          onInput={(e) => update({ name: e.currentTarget.value })}
        />
      </label>
      <div class="review-actions">
        <button
          type="button"
          class="secondary"
          data-control-id={id('earlier')}
          disabled={order() <= 0}
          onClick={() => m.move(-1)}
        >
          {c().earlier}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={id('later')}
          disabled={order() >= m.active().length - 1}
          onClick={() => m.move(1)}
        >
          {c().later}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={id('duplicate')}
          disabled={!p().name.trim()}
          onClick={() => m.duplicate(p(), p().name.slice(0, 60) + ' · ' + c().copy)}
        >
          {c().duplicate}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={id('split')}
          disabled={!p().surface || !p().name.trim()}
          onClick={() => m.split(p(), p().name.slice(0, 60) + ' · ' + c().splitName)}
        >
          {c().split}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={id('archive')}
          onClick={() => update({ archived: true })}
        >
          {c().archive}
        </button>
      </div>
      <div class="review-fields">
        <ReviewSelect
          id={id('combineWith')}
          label={c().combineWith}
          value={selected()?.id ?? ''}
          options={['', ...others().map((row) => row.id)]}
          disabled={!others().length}
          text={(key) => others().find((row) => row.id === key)?.name ?? '—'}
          change={setCombine}
        />
        <button
          type="button"
          class="secondary"
          data-control-id={id('combine')}
          disabled={!selected()}
          onClick={() => {
            const other = selected();
            if (other)
              m.combine(
                p(),
                other,
                (c().combined + ' · ' + p().name + ' / ' + other.name).slice(0, 80),
              );
          }}
        >
          {c().combine}
        </button>
      </div>
      <p class="review-note">{c().splitHelp}</p>
      <h4>{c().scope}</h4>
      <div class="review-fields">
        <ReviewSelect
          id={id('scopeSurface')}
          label={c().scopeSurface}
          value={p().surface}
          options={['', ...surfaces().map(({ id }) => id)]}
          text={(key) => surfaces().find(({ id }) => id === key)?.label ?? c().chooseSurface}
          change={(surface) => update({ surface, scope: '', measurement: 'missing' })}
        />
        <ReviewSelect
          id={id('cloneFrom')}
          label={c().cloneFrom}
          value={cloneSource()?.id ?? ''}
          options={['', ...cloneSources().map((row) => row.id)]}
          disabled={!cloneSources().length}
          text={(key) => cloneSources().find((row) => row.id === key)?.name ?? '—'}
          change={setClone}
        />
      </div>
      <div class="review-actions">
        <button
          type="button"
          class="secondary"
          data-control-id={id('draw')}
          disabled={!p().surface}
          onClick={() => update({ scope: crypto.randomUUID(), measurement: 'missing' })}
        >
          {c().draw}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={id('clone')}
          disabled={!cloneSource()}
          onClick={() => update({ scope: crypto.randomUUID(), measurement: 'missing' })}
        >
          {c().clone}
        </button>
        <Show when={p().surface}>
          <a
            class="project-back"
            data-control-id={id('scopeLink')}
            href={href()}
            onClick={(e) => followProjectLink(e, props.navigate)}
          >
            {c().scopeSurface}
          </a>
        </Show>
      </div>
      <p role="status">
        {p().scope ? c().independent : c().noMask} · {c().maskHelp}
      </p>
      <PhaseInputs
        copy={c()}
        phase={p()}
        currency={props.project.settings.currency}
        update={update}
      />
    </>
  );
}

export function WorkPhases(props: {
  copy: EstimateCopy;
  project: SavedProject;
  model: PhaseModel;
  navigate: (href: string) => void;
}) {
  const c = () => props.copy;
  const m = untrack(() => props.model);
  const [name, setName] = createSignal('');
  return (
    <section class="project-pane">
      <h3>{c().phases}</h3>
      <form
        class="review-fields"
        onSubmit={(e) => {
          e.preventDefault();
          if (name().trim()) {
            m.add(name().trim());
            setName('');
          }
        }}
      >
        <label>
          {c().add}
          <input
            data-control-id={id('newName')}
            maxlength="80"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <button data-control-id={id('add')} disabled={!name().trim()}>
          {c().add}
        </button>
      </form>
      <Show when={m.current()} fallback={<p>{c().noPhases}</p>}>
        <ReviewSelect
          id={id('phase')}
          label={c().phase}
          value={m.current()!.id}
          options={m.active().map((row) => row.id)}
          text={(key) =>
            m
              .active()
              .find(({ id }) => id === key)
              ?.name.trim() || '—'
          }
          change={m.select}
        />
        <Show when={m.current()?.id} keyed>
          {(phaseId) => (
            <PhaseDetails
              phase={m.rows.find(({ id }) => id === phaseId)!}
              model={m}
              copy={c()}
              project={props.project}
              navigate={props.navigate}
            />
          )}
        </Show>
      </Show>
      <Show when={m.rows.some((row) => row.archived)}>
        <h4>{c().archived}</h4>
        <ul class="project-register">
          <For each={m.rows.filter((row) => row.archived)}>
            {(phase) => (
              <li>
                <span>{phase.name}</span>
                <button
                  type="button"
                  class="secondary"
                  data-control-id={id('restore')}
                  onClick={() => {
                    m.update(phase.id, { archived: false });
                    m.select(phase.id);
                  }}
                >
                  {c().restore}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
