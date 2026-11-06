import { createSignal, onCleanup, onMount, Show, untrack } from 'solid-js';
import { offlineAccountKey } from '../../../platform/vault/offline-account';
import type { LocalVault } from '../../../platform/vault/vault';
import { VaultSection } from '../account-security/VaultSection';
import type { Language } from '../types';
import { OfflineOriginals, pinCopy, useOfflineOriginals } from './OfflineOriginals';
import './styles.css';

const copy = {
  en: {
    help: 'Unlock the vault to see originals pinned on this browser.',
    unavailable: 'Open Invitations while signed in to set up offline access on this browser.',
    empty: 'No originals are pinned on this browser.',
    invitations: 'Back to Invitations',
  },
  hu: {
    help: 'A böngészőben rögzített eredeti fájlokhoz oldja fel a tartalomtárat.',
    unavailable:
      'Az offline hozzáférés beállításához bejelentkezés után nyissa meg a Meghívásokat.',
    empty: 'Ebben a böngészőben nincsenek rögzített eredeti fájlok.',
    invitations: 'Vissza a meghívásokhoz',
  },
};

function Shelf(props: { vault: LocalVault; language: Language }) {
  const model = useOfflineOriginals(untrack(() => props.vault.originalPins()));
  return (
    <OfflineOriginals model={model} language={props.language} empty={copy[props.language].empty} />
  );
}

export function OfflineOriginalsPage() {
  const language = localStorage.getItem('cr-language') === 'hu' ? 'hu' : 'en';
  const c = copy[language];
  const [account, setAccount] = createSignal(localStorage.getItem(offlineAccountKey));
  const syncAccount = () => {
    if (localStorage.getItem(offlineAccountKey) !== account()) setAccount(null);
  };
  onMount(() => {
    document.documentElement.lang = language;
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
            unlockOnly={c.help}
            workspace={(vault) => <Shelf vault={vault} language={language} />}
          />
        )}
      </Show>
    </main>
  );
}
