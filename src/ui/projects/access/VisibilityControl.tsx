import { createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { projectVisibility } from '../../../platform/projects/visibility';
import type { ProjectVisibility } from '../../../platform/api';
import { visibilityState, type VisibilityState } from './visibility-state';
import { accessCopy } from './copy';

export function VisibilityControl(props: { project: string; name: string }) {
  const app = useApp();
  const c = () => accessCopy[app.lang()];
  const [state, setState] = createSignal<VisibilityState>({ busy: true, notice: 'loading' });
  // The parent keys this control by the selected project.
  const model = visibilityState(
    projectVisibility(
      app.request,
      untrack(() => props.project),
    ),
    setState,
  );
  onMount(() => void model.reload());
  onCleanup(model.dispose);
  return (
    <div class="project-visibility">
      <label>
        {c().visibility}
        <select
          data-control-id="project.access.visibility"
          value={state().value?.visibility ?? 'private'}
          disabled={state().busy || !state().value}
          onChange={(event) =>
            void model.save(event.currentTarget.value as ProjectVisibility, props.name)
          }
        >
          <option value="private">{c().private}</option>
          <option value="listed">{c().listed}</option>
        </select>
      </label>
      <p class="field-help">{c().listedHelp}</p>
      <Show when={state().notice}>
        {(notice) => (
          <p role={notice() === 'error' || notice() === 'conflictReload' ? 'alert' : 'status'}>
            {c()[notice()]}
          </p>
        )}
      </Show>
      <Show
        when={state().value?.visibility === 'listed' && state().value?.name !== props.name.trim()}
      >
        <p class="field-help">{c().nameChanged}</p>
        <button
          disabled={state().busy}
          data-control-id="project.access.publish-name"
          onClick={() => void model.save('listed', props.name)}
        >
          {c().publishName}
        </button>
      </Show>
      <Show when={!state().busy && (!state().value || state().notice === 'error')}>
        <button data-control-id="project.access.reload" onClick={() => void model.reload()}>
          {c().reload}
        </button>
      </Show>
    </div>
  );
}
