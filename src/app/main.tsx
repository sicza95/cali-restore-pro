import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import '../ui/account-access/styles.css';
import { AccountAccess } from '../ui/account-access/AccountAccess';

import { OfflineOriginalsPage } from '../ui/account-access/invitations/OfflineOriginalsPage';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/offline-worker.js').catch(() => undefined);
}

render(
  () => (location.pathname === '/offline-originals' ? <OfflineOriginalsPage /> : <AccountAccess />),
  document.getElementById('app')!,
);
