import { createSignal, For, Show, untrack } from 'solid-js';
import type { OrganisationDetail, OrganisationMember } from '../../platform/api';
import { useApp } from '../app-context/AppContext';
import { SettingsItem, SettingsSection } from '../settings/SettingsItem';
import { organisationCopy } from './organisation-copy';
import { roleLabel, useOrgAction } from './org-actions';

type Props = { detail: OrganisationDetail; changed: () => Promise<unknown> };

/** Role and groups, the same fields when inviting and when changing a member. */
function RoleAndGroups(props: {
  detail: OrganisationDetail;
  role: string;
  groups: string[];
  onRole: (role: 'admin' | 'member') => void;
  onGroups: (groups: string[]) => void;
}) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  return (
    <>
      <label>
        {c().role}
        <select
          data-control-id="org.member.role"
          value={props.role}
          onChange={(event) => props.onRole(event.currentTarget.value as 'admin' | 'member')}
        >
          <option value="member">{c().roleMember}</option>
          <option value="admin">{c().roleAdmin}</option>
        </select>
      </label>
      <Show when={props.role === 'member' && props.detail.groups.length}>
        <fieldset class="org-member-groups">
          <legend>{c().groups}</legend>
          <For each={props.detail.groups}>
            {(group) => (
              <label class="confirmation">
                <input
                  type="checkbox"
                  data-control-id="org.member.group"
                  checked={props.groups.includes(group.id)}
                  onChange={(event) =>
                    props.onGroups(
                      event.currentTarget.checked
                        ? [...props.groups, group.id]
                        : props.groups.filter((id) => id !== group.id),
                    )
                  }
                />
                {group.name}
              </label>
            )}
          </For>
        </fieldset>
      </Show>
    </>
  );
}

function groupNames(detail: OrganisationDetail, member: Pick<OrganisationMember, 'groups'>) {
  return detail.groups.filter((group) => member.groups.includes(group.id)).map((g) => g.name);
}

function MemberRow(props: Props & { member: OrganisationMember; admin: boolean }) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const [role, setRole] = createSignal(untrack(() => props.member.role));
  const [groups, setGroups] = createSignal(untrack(() => [...props.member.groups]));
  const self = () => props.member.id === app.account()?.id;
  const name = () => props.member.name || props.member.email;
  const summary = () => {
    if (props.member.role === 'admin') return c().roleAdmin;
    const names = groupNames(props.detail, props.member);
    return names.length ? names.join(', ') : c().roleMember;
  };
  const path = () => `/organisations/${props.detail.id}/members/${props.member.id}`;
  return (
    <SettingsItem
      id={`member-${props.member.id}`}
      group="members"
      title={self() ? `${name()} (${c().you})` : name()}
      help={props.member.name ? props.member.email : undefined}
      value={summary()}
      control="org.member.open"
    >
      <Show
        when={props.admin}
        fallback={
          <p class="settings-current">
            <span>{c().role}</span>
            <strong>{roleLabel(props.member.role, c())}</strong>
          </p>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await app.request(
                path(),
                { role: role(), groups: role() === 'admin' ? [] : groups() },
                'PUT',
              );
              await props.changed();
            }, c().memberSaved);
          }}
        >
          <RoleAndGroups
            detail={props.detail}
            role={role()}
            groups={groups()}
            onRole={setRole}
            onGroups={setGroups}
          />
          <div class="settings-actions">
            <Show when={!self()}>
              <button
                type="button"
                class="danger"
                data-control-id="org.member.remove"
                aria-label={c().removeMember(name())}
                disabled={busy()}
                onClick={() =>
                  void act(async () => {
                    await app.request(path(), {}, 'DELETE');
                    await props.changed();
                  }, c().removed)
                }
              >
                {c().remove}
              </button>
            </Show>
            <button class="primary" data-control-id="org.member.save" disabled={busy()}>
              {c().saveMember}
            </button>
          </div>
        </form>
      </Show>
    </SettingsItem>
  );
}

function InviteItem(props: Props) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const [email, setEmail] = createSignal('');
  const [role, setRole] = createSignal<'admin' | 'member'>('member');
  const [groups, setGroups] = createSignal<string[]>([]);
  return (
    <SettingsItem
      id="invite"
      group="members"
      icon="mail"
      title={c().invite}
      help={c().inviteHelp}
      control="org.invite.open"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act(async () => {
            await app.request(`/organisations/${props.detail.id}/invitations`, {
              email: email().trim(),
              role: role(),
              groups: role() === 'admin' ? [] : groups(),
            });
            setEmail('');
            setGroups([]);
            await props.changed();
          }, c().sent);
        }}
      >
        <label>
          {c().email}
          <input
            type="email"
            autocomplete="off"
            data-control-id="org.invite.email"
            required
            value={email()}
            onInput={(event) => setEmail(event.currentTarget.value)}
          />
        </label>
        <RoleAndGroups
          detail={props.detail}
          role={role()}
          groups={groups()}
          onRole={setRole}
          onGroups={setGroups}
        />
        <div class="settings-actions">
          <button class="primary" data-control-id="org.invite.send" disabled={busy()}>
            {c().send}
          </button>
        </div>
      </form>
    </SettingsItem>
  );
}

/** The organisation's members, and for admins: invite someone and the pending invitations. */
export function OrganisationMembers(props: Props) {
  const app = useApp();
  const c = () => organisationCopy[app.lang()];
  const { busy, act } = useOrgAction();
  const admin = () => props.detail.role === 'admin';
  const date = (iso: string) =>
    new Intl.DateTimeFormat(app.lang(), { dateStyle: 'medium' }).format(new Date(iso));
  return (
    <SettingsSection id="members" title={c().membersHeading} help={c().membersHelp}>
      <For each={props.detail.members}>
        {(member) => <MemberRow {...props} member={member} admin={admin()} />}
      </For>
      <Show when={admin()}>
        <For each={props.detail.invitations}>
          {(invitation) => (
            <div class="settings-static org-invitation">
              <span class="settings-option-text">
                <strong>{invitation.email}</strong>
                <span>
                  {`${c().pending} · ${roleLabel(invitation.role, c())} · ${c().expires(date(invitation.expiresAt))}`}
                </span>
              </span>
              <button
                data-control-id="org.invitation.cancel"
                disabled={busy()}
                onClick={() =>
                  void act(async () => {
                    await app.request(
                      `/organisations/${props.detail.id}/invitations/${invitation.id}`,
                      {},
                      'DELETE',
                    );
                    await props.changed();
                  }, c().cancelled)
                }
              >
                {c().cancelInvitation}
              </button>
            </div>
          )}
        </For>
        <InviteItem {...props} />
      </Show>
    </SettingsSection>
  );
}
