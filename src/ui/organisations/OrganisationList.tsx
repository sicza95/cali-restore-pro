import { createSignal, For, Show } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { Icon } from '../icon/Icon';
import { followLink, organisationHref } from '../router/routes';
import { SettingsItem, SettingsSection } from '../settings/SettingsItem';
import { organisationCopy } from './organisation-copy';
import { useOrganisations } from './organisation-state';
import { organisationLabel } from './OrganisationSwitcher';
import { roleLabel, useOrgAction } from './org-actions';

/** Your organisations, a form to create one, and the invitations waiting for you. */
export function OrganisationList() {
  const app = useApp();
  const orgs = useOrganisations();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const [name, setName] = createSignal('');
  const date = (iso: string) =>
    new Intl.DateTimeFormat(app.lang(), { dateStyle: 'medium' }).format(new Date(iso));
  return (
    <div class="settings-page organisations-page">
      <Show when={orgs.failed()}>
        <p role="alert">{c().failed}</p>
        <button data-control-id="org.retry" onClick={() => void orgs.refresh()}>
          {c().retry}
        </button>
      </Show>
      <Show when={orgs.loaded()} fallback={<p role="status">{orgs.failed() ? '' : c().loading}</p>}>
        <SettingsSection id="mine" title={c().yours} help={c().yoursHelp}>
          <For each={orgs.list()}>
            {(entry) => (
              <a
                class="settings-option-link"
                href={organisationHref(entry.id)}
                data-control-id="org.open"
                onClick={(event) => followLink(event, app.router.navigate)}
              >
                <span class="settings-option-icon" aria-hidden="true">
                  <Icon name={entry.personal ? 'account' : 'organisation'} size={20} />
                </span>
                <span class="settings-option-text">
                  <strong>{organisationLabel(entry, c().personal)}</strong>
                  <span>
                    {entry.personal
                      ? c().personalHelp
                      : `${roleLabel(entry.role, c())} · ${c().members(entry.memberCount)}`}
                  </span>
                </span>
                <Show when={orgs.selected()?.id === entry.id}>
                  <span class="settings-option-value">{c().current}</span>
                </Show>
                <Icon name="chevron" size={16} class="settings-option-chevron" />
              </a>
            )}
          </For>
          <SettingsItem
            id="create-organisation"
            group="mine"
            icon="plus"
            title={c().create}
            help={c().createHelp}
            control="org.create.open"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = name().trim();
                if (!value) return;
                void act(async () => {
                  const created = await app.request<{ id: string }>('/organisations', {
                    name: value,
                    language: app.lang(),
                  });
                  setName('');
                  await orgs.refresh();
                  orgs.select(created.id);
                  app.router.navigate(organisationHref(created.id));
                }, c().created);
              }}
            >
              <label>
                {c().createName}
                <input
                  data-control-id="org.create.name"
                  required
                  maxLength={100}
                  value={name()}
                  onInput={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <div class="settings-actions">
                <button class="primary" data-control-id="org.create" disabled={busy()}>
                  {c().create}
                </button>
              </div>
            </form>
          </SettingsItem>
        </SettingsSection>
        <SettingsSection id="invitations" title={c().invitations} help={c().invitationsHelp}>
          <Show
            when={orgs.invitations().length}
            fallback={<p class="settings-static settings-list-empty">{c().noInvitations}</p>}
          >
            <For each={orgs.invitations()}>
              {(invitation) => (
                <div class="settings-static org-invitation">
                  <span class="settings-option-text">
                    <strong>{invitation.name}</strong>
                    <span>
                      {`${c().invitedBy(invitation.invitedBy)}, ${c().invitedAs(roleLabel(invitation.role, c()))}. ${c().expires(date(invitation.expiresAt))}`}
                    </span>
                  </span>
                  <div class="settings-actions">
                    <button
                      data-control-id="org.invitation.decline"
                      disabled={busy()}
                      onClick={() =>
                        void act(async () => {
                          await app.request(
                            `/organisation-invitations/${invitation.id}/decline`,
                            {},
                          );
                          await orgs.refresh();
                        }, c().declined)
                      }
                    >
                      {c().decline}
                    </button>
                    <button
                      class="primary"
                      data-control-id="org.invitation.accept"
                      disabled={busy()}
                      onClick={() =>
                        void act(async () => {
                          await app.request(
                            `/organisation-invitations/${invitation.id}/accept`,
                            {},
                          );
                          await orgs.refresh();
                        }, c().joined)
                      }
                    >
                      {c().accept}
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </SettingsSection>
      </Show>
    </div>
  );
}
