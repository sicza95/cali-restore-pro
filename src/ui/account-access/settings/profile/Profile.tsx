import type { DeletionPreflight } from '../../../../platform/api/types.gen';
import { createSignal, Show } from 'solid-js';
import { settingsCopy } from '../constants';
import type { SettingsProps } from '../types';

export function Profile(props: SettingsProps) {
  const c = () => settingsCopy[props.model.lang()];
  const [blocked, setBlocked] = createSignal<DeletionPreflight['reason']>();
  return (
    <>
      <section class="account-section">
        <div>
          <h2>{c().identity}</h2>
        </div>
        <div class="account-panel">
          <div>
            <strong>{props.model.t('email')}</strong>
            <br />
            <span class="account-email">{props.model.account()?.email}</span>
          </div>
          <a href="/settings/security">{props.model.t('security')}</a>
        </div>
      </section>
      <section class="account-section">
        <div>
          <h2>{c().deletion}</h2>
        </div>
        <div class="account-panel">
          <button
            class="secondary"
            disabled={props.model.busy()}
            onClick={async () => {
              const result = await props.model.read<DeletionPreflight>(
                '/account/deletion-preflight',
              );
              setBlocked(result?.reason);
            }}
          >
            {c().preflight}
          </button>
          <Show when={blocked()}>
            <p role="status">
              {blocked() === 'hosted_projects_require_continuity' ? c().blockedHosted : c().blocked}
            </p>
          </Show>
        </div>
      </section>
    </>
  );
}
