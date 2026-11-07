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
  const force = () => check()?.forceEligible === true;
  const hu = () => props.model.lang() === 'hu';
  const c = () => settingsCopy[props.model.lang()];
  return (
    <div class="account-panel">
      <Show when={!props.pending}>
        <button
          data-control-id="account.deletion.preflight"
          class="secondary"
          disabled={props.model.busy()}
          onClick={async () => {
            setCheck(await props.model.read<DeletionPreflight>(props.path + '/deletion-preflight'));
          }}
        >
          {c().preflight}
        </button>
      </Show>
      <Show when={check() && !check()?.eligible && !force()}>
        <p role="status">
          {check()?.reason === 'hosted_projects_require_continuity'
            ? c().blockedHosted
            : c().blocked}
        </p>
      </Show>
      <Show when={check()?.eligible || force() || props.pending}>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const purge = props.pending || new FormData(event.currentTarget).has('purge');
            const result = await props.model.run(
              props.path + '/deletion',
              force()
                ? { confirm: true, force: true, purge }
                : { confirm: true, pendingWorkResolved: true, purge },
              'success',
            );
            if (result && result.recoverUntil && result.backupExpiresAt) props.onChange?.();
          }}
        >
          <Show when={force()}>
            <p>
              {hu()
                ? 'A kizárólagos tulajdonú projektek befagyasztva maradnak a helyreállítási határidőig. A meglévő együttműködők addig csak a már megosztott tartalmat érhetik el. A társtulajdonosok megtartják projektjeiket, és átvehetik a szerveres tárolást.'
                : 'Sole-owner projects are frozen until the recovery deadline. Existing collaborators can retrieve their already shared content during that window. Co-owners keep their projects and can take over hosting.'}
            </p>
          </Show>
          <Show when={!force()}>
            <p>
              {hu()
                ? 'Mentse a helyi és függő munkát titkosított projektmentésbe. A fiók 30 napig állítható helyre. A szervermentések legkésőbb a törléstől számított 90. napon járnak le.'
                : 'Export an encrypted project backup for local and pending work. Account recovery lasts 30 days. Operational backups expire within 90 days of deletion.'}{' '}
              <a href="/projects">{props.model.t('projects')}</a>
            </p>
          </Show>
          <p>
            {hu()
              ? 'A törléshez friss jelszó-megerősítés szükséges.'
              : 'Deletion requires a recent password confirmation.'}{' '}
            <a href="/settings/security">{props.model.t('security')}</a>
          </p>
          <label class="confirmation">
            <input type="checkbox" required />
            {force()
              ? hu()
                ? 'Megerősítem a kényszerített törlést.'
                : 'I confirm forced deletion.'
              : hu()
                ? 'A függő munkát rendeztem, és megerősítem a törlést.'
                : 'I resolved pending work and confirm deletion.'}
          </label>
          <Show when={!props.pending}>
            <label class="confirmation">
              <input data-control-id="account.deletion.purge" type="checkbox" name="purge" />
              {hu() ? 'A helyreállítási időszak kihagyása' : 'Skip live recovery and queue purge'}
            </label>
          </Show>
          <button
            data-control-id="account.deletion.apply"
            class="secondary"
            disabled={props.model.busy()}
          >
            {props.pending
              ? hu()
                ? 'Végleges törlés indítása'
                : 'Queue live purge'
              : force()
                ? hu()
                  ? 'Fiók kényszerített törlése'
                  : 'Force account deletion'
                : hu()
                  ? 'Fiók törlése'
                  : 'Delete account'}
          </button>
        </form>
      </Show>
    </div>
  );
}
