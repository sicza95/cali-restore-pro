import { render } from 'solid-js/web';
import '@fontsource-variable/dm-sans';
import '../ui/tokens.css';
import '../ui/account-access/styles.css';
import '../ui/account-access/shell.css';
import '../ui/app-shell/styles.css';
import { AccountAccess } from '../ui/account-access/AccountAccess';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/offline-worker.js').catch(() => undefined);
}

// History restores can otherwise reuse a frozen session and its capability snapshot.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !document.getElementById('app')?.hasAttribute('data-auth-link'))
    location.reload();
});

render(() => <AccountAccess />, document.getElementById('app')!);
