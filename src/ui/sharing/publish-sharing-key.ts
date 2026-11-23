import { onMount } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import { localSharingKey } from '../../platform/projects/fixture-sharing';
import type { LocalVault } from '../../platform/vault/vault';

/**
 * Publishes this account's sharing key when a sharing page opens, so others can share with it.
 * While encryption is off (aead.ts) there is no fingerprint to show or compare.
 */
export function usePublishSharingKey(vault: LocalVault) {
  const app = useApp();
  onMount(() => {
    void (async () => {
      try {
        const key = await localSharingKey(vault);
        key.signal.throwIfAborted();
        await app.request('/sharing-identity', { publicKey: key.publicKey });
      } catch {
        // Retried the next time a sharing page opens; sharing actions publish it again too.
      }
    })();
  });
}
