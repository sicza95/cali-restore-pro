import { useApp } from '../app-context/AppContext';
import { invitationCopy } from './copy';
import { managementCopy } from './management-copy';
import type { SentInvitation } from './types';
import type { useInvitations } from './useInvitations';
export function ProjectInviteForm(props: {
  path: string;
  sent: ReturnType<typeof useInvitations<SentInvitation>>;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        const email = String(fields.get('email') ?? '');
        const coOwner = fields.has('coOwner');
        const estimateScope = fields.get('estimateScope');
        const shareHistory = fields.has('shareHistory');
        void props.sent
          .run(() => app.request(props.path, { email, coOwner, estimateScope, shareHistory }))
          .then((ok) => {
            if (ok) form.reset();
          });
      }}
    >
      <p class="field-help">{managementCopy[app.lang()].registeredOnly}</p>
      <label>
        {c().recipient}
        <input
          data-control-id="sharing.recipient"
          type="email"
          name="email"
          required
          maxLength={254}
          disabled={props.sent.busy()}
        />
      </label>
      <label>
        {c().estimateScope}
        <select
          data-control-id="sharing.estimate"
          name="estimateScope"
          disabled={props.sent.busy()}
        >
          <option value="none">{c().noEstimate}</option>
          <option value="estimate-summary">{c()['estimate-summary']}</option>
          <option value="estimate-full">{c()['estimate-full']}</option>
        </select>
      </label>
      <label class="confirmation">
        <input
          data-control-id="sharing.history"
          type="checkbox"
          name="shareHistory"
          disabled={props.sent.busy()}
        />
        {c().includeHistory}
      </label>
      <label class="confirmation">
        <input
          data-control-id="sharing.co-owner"
          type="checkbox"
          name="coOwner"
          disabled={props.sent.busy()}
        />
        {c().inviteCoOwner}
      </label>
      <button data-control-id="sharing.issue" disabled={props.sent.busy()}>
        {c().issue}
      </button>
    </form>
  );
}
