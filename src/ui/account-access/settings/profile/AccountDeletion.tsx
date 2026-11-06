import { createSignal, Show } from 'solid-js';
import type { DeletionPreflight } from '../../../../platform/api/types.gen';
import type { SettingsModel } from '../types';
import { settingsCopy } from '../constants';

export function AccountDeletion(props: {
  model: SettingsModel;
  path: string;
  pending?: boolean;
  onChange?: () => void;
}) {
  const [check, setCheck] = createSignal<DeletionPreflight>();
  const [deadlines, setDeadlines] = createSignal<{
    recoverUntil: string;
    backupExpiresAt: string;
  }>();
  const hu = () => props.model.lang() === 'hu';
  const c = () => settingsCopy[props.model.lang()];
  const date = (value: string) =>
    new Intl.DateTimeFormat(props.model.lang(), { dateStyle: 'long', timeStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <div class="account-panel">
      <Show when={!props.pending}>
        <button
          class="secondary"
          disabled={props.model.busy()}
          onClick={async () => {
            setCheck(await props.model.read<DeletionPreflight>(props.path + '/deletion-preflight'));
          }}
        >
          {c().preflight}
        </button>
      </Show>
      <Show when={check() && !check()?.eligible}>
        <p role="status">
          {check()?.reason === 'hosted_projects_require_continuity'
            ? c().blockedHosted
            : c().blocked}
        </p>
      </Show>
      <Show when={!deadlines() && (check()?.eligible || props.pending)}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const purge = props.pending || new FormData(event.currentTarget).has('purge');
            const result = await props.model.run(
              props.path + '/deletion',
              { confirm: true, pendingWorkResolved: true, purge },
              'success',
            );
            if (result && result.recoverUntil && result.backupExpiresAt) {
              setDeadlines({
                recoverUntil: result.recoverUntil,
                backupExpiresAt: result.backupExpiresAt,
              });
              props.onChange?.();
            }
          }}
        >
          <p>
            {hu()
              ? 'Mentse a helyi és függő munkát titkosított projektmentésbe. A fiók 30 napig állítható helyre. A szervermentések legkésőbb a törléstől számított 90. napon járnak le.'
              : 'Export an encrypted project backup for local and pending work. Account recovery lasts 30 days. Operational backups expire within 90 days of deletion.'}{' '}
            <a href="/projects">{props.model.t('projects')}</a>
          </p>
          <p>
            {hu()
              ? 'A törléshez friss jelszó-megerősítés szükséges.'
              : 'Deletion requires a recent password confirmation.'}{' '}
            <a href="/settings/security">{props.model.t('security')}</a>
          </p>
          <label class="confirmation">
            <input type="checkbox" required />
            {hu()
              ? 'A függő munkát rendeztem, és megerősítem a törlést.'
              : 'I resolved pending work and confirm deletion.'}
          </label>
          <Show when={!props.pending}>
            <label class="confirmation">
              <input type="checkbox" name="purge" />
              {hu() ? 'A helyreállítási időszak kihagyása' : 'Skip live recovery and queue purge'}
            </label>
          </Show>
          <button class="secondary" disabled={props.model.busy()}>
            {props.pending
              ? hu()
                ? 'Végleges törlés indítása'
                : 'Queue live purge'
              : hu()
                ? 'Fiók törlése'
                : 'Delete account'}
          </button>
        </form>
      </Show>
      <Show when={deadlines()}>
        {(value) => (
          <p role="status">
            {hu() ? 'Helyreállítási határidő' : 'Live recovery deadline'}{' '}
            {date(value().recoverUntil)}.{' '}
            {hu() ? 'Szervermentések lejárata legkésőbb' : 'Operational backups expire by'}{' '}
            {date(value().backupExpiresAt)}.
          </p>
        )}
      </Show>
    </div>
  );
}
