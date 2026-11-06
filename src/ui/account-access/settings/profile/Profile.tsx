import { settingsCopy } from '../constants';
import type { SettingsProps } from '../types';
import { AccountDeletion } from './AccountDeletion';

export function Profile(props: SettingsProps) {
  const c = () => settingsCopy[props.model.lang()];
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
        <AccountDeletion model={props.model} path="/account" />
      </section>
    </>
  );
}
