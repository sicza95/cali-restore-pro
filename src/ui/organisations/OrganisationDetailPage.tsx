import { createResource, createSignal, For, Show, untrack } from 'solid-js';
import type { OrganisationDetail, OrganisationGroupWrite } from '../../platform/api';
import { useApp } from '../app-context/AppContext';
import { accountPaths } from '../router/constants';
import { followLink, organisationHref } from '../router/routes';
import { SettingsItem, SettingsSection } from '../settings/SettingsItem';
import { emptyGroup, GroupEditor } from './GroupEditor';
import { organisationCopy } from './organisation-copy';
import { useOrganisations } from './organisation-state';
import { organisationLabel } from './OrganisationSwitcher';
import { OrganisationMembers } from './OrganisationMembers';
import { useOrgAction } from './org-actions';
import { liveVersion } from './live-updates';
import { OrganisationDefaults } from './defaults/OrganisationDefaults';

/** One organisation: its members and invitations, its groups and its own settings. */
export function OrganisationDetailPage(props: { id: string }) {
  const app = useApp();
  const orgs = useOrganisations();
  const c = () => organisationCopy[app.lang()];
  // Read again whenever a live notice arrives: someone joined, left or changed something.
  const [detail, { refetch }] = createResource(
    () => [props.id, liveVersion()] as const,
    ([id]) => app.request<OrganisationDetail>(`/organisations/${id}`),
  );
  const current = () => {
    const value = detail.state === 'ready' ? detail() : detail.latest;
    return value?.id === props.id ? value : undefined;
  };
  const names = () => {
    const shown = current();
    return shown ? { [shown.id]: organisationLabel(shown, c().personal) } : {};
  };
  app.provideNames(names);
  const changed = () => Promise.all([refetch(), orgs.refresh()]);
  return (
    <div class="settings-page organisations-page">
      <Show when={detail.error}>
        <p role="alert">{c().notFound}</p>
        <a
          href={accountPaths.organisations}
          onClick={(event) => followLink(event, app.router.navigate)}
        >
          {c().back}
        </a>
      </Show>
      <Show when={!detail.error && current()} fallback={<p role="status">{c().loading}</p>}>
        {(shown) => (
          <>
            <Show when={orgs.selected()?.id !== shown().id}>
              <div class="settings-actions org-switch-here">
                <button data-control-id="org.select" onClick={() => orgs.select(shown().id)}>
                  {c().useThis}
                </button>
              </div>
            </Show>
            <Show when={shown().id} keyed>
              {(id) => <OrganisationDefaults detail={{ ...shown(), id }} changed={changed} />}
            </Show>
            <Show
              when={!shown().personal}
              fallback={
                <SettingsSection id="personal" title={c().personal} help={c().personalHelp}>
                  <a
                    class="settings-option-link"
                    href={accountPaths.organisations}
                    data-control-id="org.personal.create"
                    onClick={(event) => followLink(event, app.router.navigate)}
                  >
                    <span class="settings-option-text">
                      <strong>{c().create}</strong>
                      <span>{c().createHelp}</span>
                    </span>
                  </a>
                </SettingsSection>
              }
            >
              <OrganisationMembers detail={shown()} changed={changed} />
              <Groups detail={shown()} changed={changed} />
              <Settings detail={shown()} changed={changed} />
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

function Groups(props: { detail: OrganisationDetail; changed: () => Promise<unknown> }) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const admin = () => props.detail.role === 'admin';
  const base = () => `/organisations/${props.detail.id}/groups`;
  const [fresh, setFresh] = createSignal(0);
  async function save(id: string | undefined, next: OrganisationGroupWrite) {
    await act(async () => {
      if (id) await app.request(`${base()}/${id}`, next, 'PUT');
      else {
        await app.request(base(), next);
        setFresh((n) => n + 1);
      }
      await props.changed();
    }, c().groupSaved);
  }
  async function remove(id: string) {
    await act(async () => {
      await app.request(`${base()}/${id}`, {}, 'DELETE');
      await props.changed();
    }, c().groupDeleted);
  }
  return (
    <SettingsSection id="groups" title={c().groupsHeading} help={c().groupsHelp}>
      <For each={props.detail.groups}>
        {(group) => (
          <SettingsItem
            id={`group-${group.id}`}
            group="groups"
            title={group.name}
            value={group.allProjects ? c().allProjectsShort : undefined}
            control="org.group.open"
          >
            <GroupEditor
              group={group}
              editable={admin()}
              busy={busy()}
              onSave={(next) => void save(group.id, next)}
              onDelete={() => void remove(group.id)}
            />
          </SettingsItem>
        )}
      </For>
      <Show when={admin()}>
        <SettingsItem
          id="new-group"
          group="groups"
          icon="plus"
          title={c().newGroup}
          control="org.group.new"
        >
          {/* A new, empty editor after every save. */}
          <Show when={fresh() + 1} keyed>
            <GroupEditor
              group={emptyGroup()}
              editable
              busy={busy()}
              onSave={(next) => void save(undefined, next)}
            />
          </Show>
        </SettingsItem>
      </Show>
    </SettingsSection>
  );
}

function Settings(props: { detail: OrganisationDetail; changed: () => Promise<unknown> }) {
  const app = useApp();
  const orgs = useOrganisations();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const admin = () => props.detail.role === 'admin';
  const [name, setName] = createSignal(untrack(() => props.detail.name));
  const [sure, setSure] = createSignal(false);
  const path = () => `/organisations/${props.detail.id}`;
  const gone = async () => {
    await orgs.refresh();
    app.router.navigate(organisationHref());
  };
  return (
    <SettingsSection
      id="organisation"
      title={c().settingsHeading}
      help={admin() ? c().projectsCount(props.detail.projects) : c().adminOnly}
    >
      <Show when={admin()}>
        <SettingsItem id="rename" group="organisation" title={c().rename} value={props.detail.name}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                await app.request(path(), { name: name().trim() }, 'PATCH');
                await props.changed();
              }, c().renamed);
            }}
          >
            <label>
              {c().createName}
              <input
                data-control-id="org.rename.name"
                required
                maxLength={100}
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <div class="settings-actions">
              <button class="primary" data-control-id="org.rename" disabled={busy()}>
                {c().rename}
              </button>
            </div>
          </form>
        </SettingsItem>
      </Show>
      <SettingsItem id="leave" group="organisation" title={c().leave} help={c().leaveHelp}>
        <div class="settings-actions">
          <button
            class="danger"
            data-control-id="org.leave"
            disabled={busy()}
            onClick={() =>
              void act(async () => {
                await app.request(`${path()}/members/${app.account()!.id}`, {}, 'DELETE');
                await gone();
              }, c().left)
            }
          >
            {c().leave}
          </button>
        </div>
      </SettingsItem>
      <Show when={admin()}>
        <SettingsItem id="delete" group="organisation" title={c().deleteOrg} help={c().deleteHelp}>
          <label class="confirmation">
            <input
              type="checkbox"
              data-control-id="org.delete.confirm"
              checked={sure()}
              onChange={(event) => setSure(event.currentTarget.checked)}
            />
            {c().deleteConfirm}
          </label>
          <div class="settings-actions">
            <button
              class="danger"
              data-control-id="org.delete"
              disabled={busy() || !sure()}
              onClick={() =>
                void act(async () => {
                  await app.request(path(), {}, 'DELETE');
                  await gone();
                }, c().deleted)
              }
            >
              {c().deleteOrg}
            </button>
          </div>
        </SettingsItem>
      </Show>
    </SettingsSection>
  );
}
