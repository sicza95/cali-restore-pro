import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import '../ui/account-access/styles.css';
import { AccountAccess } from '../ui/account-access/AccountAccess';

import { OfflineOriginalsPage } from '../ui/account-access/invitations/OfflineOriginalsPage';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/offline-worker.js').catch(() => undefined);
}

// History restores can otherwise reuse a frozen session and its capability snapshot.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !document.getElementById('app')?.hasAttribute('data-auth-link'))
    location.reload();
});

render(
  () => (location.pathname === '/offline-originals' ? <OfflineOriginalsPage /> : <AccountAccess />),
  document.getElementById('app')!,
);
