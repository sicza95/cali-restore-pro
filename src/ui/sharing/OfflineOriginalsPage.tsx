import { createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { offlineAccountKey } from '../../platform/vault/offline-account';
import type { LocalVault } from '../../platform/vault/vault';
import { VaultSection } from '../account/account-security/VaultSection';
import { applyLanguage, storedLanguage } from '../account-access/presentation';
import {
  applyPreferences,
  loadPreferences,
  preferenceDefaults,
} from '../settings/preferences/utils';
import type { Language } from '../account-access/types';
import { OfflineOriginals, useOfflineOriginals } from './OfflineOriginals';
import { pinCopy } from './pin-copy';
import './styles.css';
import { offlinePageCopy as copy } from './offline-page-copy';

function Shelf(props: { vault: LocalVault; language: Language }) {
  const model = useOfflineOriginals(untrack(() => props.vault.originalPins()));
  return (
    <OfflineOriginals model={model} language={props.language} empty={copy[props.language].empty} />
  );
}

export function OfflineOriginalsPage() {
  const language = storedLanguage();
  const c = copy[language];
  const [account, setAccount] = createSignal(localStorage.getItem(offlineAccountKey));
  const syncAccount = () => {
    if (localStorage.getItem(offlineAccountKey) !== account()) {
      setAccount(null);
      applyPreferences(preferenceDefaults);
    }
  };
  onMount(() => {
    applyLanguage(language);
    const id = account();
    const preferences = id ? loadPreferences(id) : preferenceDefaults;
    const theme = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyPreferences(account() ? preferences : preferenceDefaults);
    apply();
    theme.addEventListener('change', apply);
    onCleanup(() => theme.removeEventListener('change', apply));
    window.addEventListener('storage', syncAccount);
    window.addEventListener('pageshow', syncAccount);
  });
  onCleanup(() => {
    window.removeEventListener('storage', syncAccount);
    window.removeEventListener('pageshow', syncAccount);
  });
  return (
    <main class="account-content offline-originals-page">
      <a class="offline-originals-back" href="/invitations">
        {c.invitations}
      </a>
      <h1>{pinCopy[language].heading}</h1>
      <Show when={account()} keyed fallback={<p>{c.unavailable}</p>}>
        {(id) => (
          <VaultSection
            account={id}
            language={language}
            workspace={(vault) => <Shelf vault={vault} language={language} />}
          />
        )}
      </Show>
    </main>
  );
}
