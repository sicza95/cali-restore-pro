import { settingsCopy } from '../constants';
import { useApp } from '../../app-context/AppContext';
import { AccountDeletion } from './AccountDeletion';

export function Profile() {
  const app = useApp();
  const c = () => settingsCopy[app.lang()];
  return (
    <>
      <section class="account-section">
        <div>
          <h2>{c().identity}</h2>
        </div>
        <div class="account-panel">
          <div>
            <strong>{app.t('email')}</strong>
            <br />
            <span class="account-email">{app.account()?.email}</span>
          </div>
          <a href="/settings/security">{app.t('security')}</a>
        </div>
      </section>
      <section class="account-section">
        <div>
          <h2>{c().deletion}</h2>
        </div>
        <AccountDeletion path="/account" />
      </section>
    </>
  );
}
