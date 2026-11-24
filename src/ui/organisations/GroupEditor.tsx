import { createSignal, For, Show, untrack } from 'solid-js';
import { createStore } from 'solid-js/store';
import type {
  OrganisationAction,
  OrganisationGroup,
  OrganisationGroupWrite,
  OrganisationSections,
} from '../../platform/api';
import { useApp } from '../app-context/AppContext';
import { organisationCopy } from './organisation-copy';

export const sectionNames = [
  'core',
  'client',
  'assessment',
  'photos',
  'scope-of-work',
  'pricing',
  'pricing-summary',
  'internal-notes',
  'admin',
] as const satisfies readonly (keyof OrganisationSections)[];
export const actionNames = [
  'members.manage',
  'project.settings',
  'estimate.publish',
  'photos.delete',
  'project.export',
] as const satisfies readonly OrganisationAction[];

type Level = 'none' | 'read' | 'write';
const levels: Level[] = ['none', 'read', 'write'];

export const emptyGroup = (): OrganisationGroupWrite => ({
  name: '',
  sections: Object.fromEntries(sectionNames.map((s) => [s, 'none'])),
  actions: [],
  allProjects: false,
});

/**
 * What a group gives: none, view or edit for each part of a project, the allowed actions and
 * whether it covers every project. Admins edit it; members see it read-only.
 */
export function GroupEditor(props: {
  group: OrganisationGroup | OrganisationGroupWrite;
  editable: boolean;
  busy: boolean;
  onSave: (group: OrganisationGroupWrite) => void;
  onDelete?: () => void;
}) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  // The editor starts from the group as it is and keeps its own draft.
  const initial = untrack(
    () =>
      JSON.parse(
        JSON.stringify({
          name: props.group.name,
          sections: props.group.sections,
          actions: props.group.actions ?? [],
          allProjects: props.group.allProjects ?? false,
        }),
      ) as OrganisationGroupWrite,
  );
  const [draft, setDraft] = createStore<OrganisationGroupWrite>(initial);
  const [touched, setTouched] = createSignal(false);
  const level = (section: (typeof sectionNames)[number]) =>
    (draft.sections[section] ?? 'none') as Level;
  const setLevel = (section: (typeof sectionNames)[number], value: Level) => {
    setTouched(true);
    setDraft('sections', section, value);
    // Whoever reads pricing also reads the published quote.
    if (section === 'pricing' && value !== 'none' && level('pricing-summary') === 'none')
      setDraft('sections', 'pricing-summary', 'read');
  };
  const toggleAction = (action: OrganisationAction, on: boolean) => {
    setTouched(true);
    setDraft('actions', (list = []) =>
      on
        ? actionNames.filter((a) => a === action || list.includes(a))
        : list.filter((a) => a !== action),
    );
  };
  return (
    <form
      class="org-group-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const plain = JSON.parse(JSON.stringify(draft)) as OrganisationGroupWrite;
        props.onSave({ ...plain, name: plain.name.trim() });
        setTouched(false);
      }}
    >
      <Show when={props.editable}>
        <label>
          {c().groupName}
          <input
            data-control-id="org.group.name"
            required
            maxLength={60}
            value={draft.name}
            onInput={(event) => {
              setTouched(true);
              setDraft('name', event.currentTarget.value);
            }}
          />
        </label>
      </Show>
      <fieldset class="org-group-sections" disabled={!props.editable}>
        <legend>{c().sectionsLegend}</legend>
        <For each={sectionNames}>
          {(section) => (
            <label class="org-group-section">
              <span>
                {c().sections[section]}
                <Show when={section === 'pricing-summary'}>
                  <small>{c().summaryNote}</small>
                </Show>
              </span>
              <select
                data-control-id={`org.group.section.${section}`}
                value={level(section)}
                onChange={(event) => setLevel(section, event.currentTarget.value as Level)}
              >
                <For each={section === 'pricing-summary' ? levels.slice(0, 2) : levels}>
                  {(value) => <option value={value}>{c().levels[value]}</option>}
                </For>
              </select>
            </label>
          )}
        </For>
      </fieldset>
      <fieldset class="org-group-actions" disabled={!props.editable}>
        <legend>{c().actionsLegend}</legend>
        <For each={actionNames}>
          {(action) => (
            <label class="confirmation">
              <input
                type="checkbox"
                data-control-id={`org.group.action.${action}`}
                checked={draft.actions?.includes(action)}
                onChange={(event) => toggleAction(action, event.currentTarget.checked)}
              />
              {c().actions[action]}
            </label>
          )}
        </For>
        <label class="confirmation">
          <input
            type="checkbox"
            data-control-id="org.group.all-projects"
            checked={draft.allProjects}
            onChange={(event) => {
              setTouched(true);
              setDraft('allProjects', event.currentTarget.checked);
            }}
          />
          {c().allProjects}
        </label>
      </fieldset>
      <Show when={props.editable}>
        <div class="settings-actions">
          <Show when={props.onDelete}>
            {(remove) => (
              <button
                type="button"
                class="danger"
                data-control-id="org.group.delete"
                disabled={props.busy}
                onClick={() => remove()()}
              >
                {c().deleteGroup}
              </button>
            )}
          </Show>
          <button
            class="primary"
            data-control-id="org.group.save"
            disabled={props.busy || !touched()}
          >
            {c().saveGroup}
          </button>
        </div>
      </Show>
    </form>
  );
}
