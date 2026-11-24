import { createSignal, Show } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import type { DeletionPreflight } from '../../../platform/api/types.gen';
import { settingsCopy } from '../settings-copy';
import { deletionCopy } from './deletion-copy';

export function AccountDeletion(props: { path: string; pending?: boolean; onChange?: () => void }) {
  const app = useApp();
  const [check, setCheck] = createSignal<DeletionPreflight>();
  const force = () => check()?.forceEligible === true;
  const d = () => deletionCopy[app.lang()];
  const c = () => settingsCopy[app.lang()];
  return (
    <div class="account-panel">
      <Show when={!props.pending}>
        <button
          data-control-id="account.deletion.preflight"
          disabled={app.busy()}
          onClick={async () => {
            setCheck(await app.read<DeletionPreflight>(props.path + '/deletion-preflight'));
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
            const result = await app.run(
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
            <p>{d().forceHelp}</p>
          </Show>
          <Show when={!force()}>
            <p>
              {d().exportHelp} <a href="/projects">{app.t('projects')}</a>
            </p>
          </Show>
          <label class="confirmation">
            <input type="checkbox" required />
            {force() ? d().confirmForce : d().confirm}
          </label>
          <Show when={!props.pending}>
            <label class="confirmation">
              <input data-control-id="account.deletion.purge" type="checkbox" name="purge" />
              {d().skipRecovery}
            </label>
          </Show>
          <button class="danger" data-control-id="account.deletion.apply" disabled={app.busy()}>
            {props.pending ? d().purge : force() ? d().deleteForced : d().delete}
          </button>
        </form>
      </Show>
    </div>
  );
}
