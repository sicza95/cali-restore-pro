import { createResource, createSignal, For, Show } from 'solid-js';
import type { OrganisationDetail } from '../../../platform/api';
import type { SavedProject } from '../../../platform/projects/types';
import { copy } from './group-invites-copy';
import { useApp } from '../../app-context/AppContext';
import { organisationCopy } from '../../organisations/organisation-copy';
import { invitationCopy } from '../../sharing/copy';
import type { SentInvitation } from '../../sharing/types';

export function ProjectGroupInvites(props: { project: SavedProject; hosted: boolean }) {
  const app = useApp();
  const c = () => copy[app.lang()];
  const org = () => organisationCopy[app.lang()];
  const invite = () => invitationCopy[app.lang()];
  const [detail] = createResource(
    () => props.project.organisation,
    (id) => app.request<OrganisationDetail>('/organisations/' + id),
  );
  const [groupId, setGroupId] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal('');
  const [failed, setFailed] = createSignal(false);
  const members = () =>
    detail()?.members.filter(
      (member) => member.groups.includes(groupId()) && member.id !== app.account()?.id,
    ) ?? [];
  async function send(form: HTMLFormElement) {
    if (busy()) return;
    setBusy(true);
    setFailed(false);
    setMessage('');
    let count = 0;
    try {
      const fields = new FormData(form);
      const path = '/hosted-projects/' + props.project.id;
      const [existing, owners] = await Promise.all([
        app.request<{ invitations: SentInvitation[] }>(path + '/invitations'),
        app.request<{ owners: { id: string }[] }>(path + '/owners'),
      ]);
      for (const member of members()) {
        if (
          owners.owners.some((owner) => owner.id === member.id) ||
          existing.invitations.some(
            (row) => row.recipientId === member.id && row.state !== 'revoked',
          )
        )
          continue;
        await app.request(path + '/invitations', {
          email: member.email,
          groupId: groupId(),
          coOwner: fields.has('coOwner'),
          estimateScope: fields.get('estimateScope'),
          shareHistory: fields.has('shareHistory'),
        });
        count++;
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setMessage(c().done(count));
    }
  }
  return (
    <section class="project-settings">
      <p>{c().help}</p>
      <Show when={detail.error}>
        <p role="alert">{c().failed}</p>
      </Show>
      <Show when={detail()?.groups.length} fallback={<p>{c().empty}</p>}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(event.currentTarget);
          }}
        >
          <label>
            {org().groups}
            <select value={groupId()} onChange={(event) => setGroupId(event.currentTarget.value)}>
              <option value="">{org().groups}</option>
              <For each={detail()?.groups}>
                {(group) => <option value={group.id}>{group.name}</option>}
              </For>
            </select>
          </label>
          <ul>
            <For each={members()}>{(member) => <li>{member.name || member.email}</li>}</For>
          </ul>
          <label>
            {invite().estimateScope}
            <select name="estimateScope">
              <option value="none">{invite().noEstimate}</option>
              <option value="estimate-summary">{invite()['estimate-summary']}</option>
              <option value="estimate-full">{invite()['estimate-full']}</option>
            </select>
          </label>
          <label class="confirmation">
            <input type="checkbox" name="shareHistory" />
            {invite().includeHistory}
          </label>
          <label class="confirmation">
            <input type="checkbox" name="coOwner" />
            {invite().inviteCoOwner}
          </label>
          <button disabled={busy() || !props.hosted || !members().length}>{c().invite}</button>
        </form>
      </Show>
      <p role={failed() ? 'alert' : 'status'}>
        {message()} {failed() ? c().failed : ''}
      </p>
    </section>
  );
}
