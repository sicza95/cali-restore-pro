# M-07: offline pins for shared originals

In **Invitations**, open a verified shared project and select **Make available
offline** beside an original. The browser verifies each encrypted part before
storing it in the recipient's vault. The filename and original key are sealed
under the vault key. The pin appears under **Offline originals** only after the
complete download and a final access check. A cancelled or failed download is
discarded; retry starts a fresh download. Unfinished rows left by an abrupt tab
exit are hidden and pruned by the existing staging cleanup after 24 hours.

After opening **Invitations** while signed in, use **Offline originals**
(`/offline-originals`) to reopen pins on the same browser after closing the
app. The production service worker caches the app shell and static assets
on the first online visit. The browser remembers only the account ID used
to select the local vault. Sign-out clears that selection. The offline page
requires an explicit vault unlock with the recovery key or the existing
remembered-browser option. Use **Save a copy** to export a pinned original.
**Remove offline copy** releases this browser's pin. Forgetting the vault
removes all its local pins. Owner originals already reside in the owner's
encrypted local store.

The offline page and the unlocked invitation workspace check each pin against
the per-file grant endpoint when opened online or after reconnecting. An online
open also checks access. A definitive denial deletes the cached ciphertext and
sealed key. Transient failures prevent an online open and leave the pin for a
later check.
A device cannot learn revocation while disconnected. Copies already exported
from the app cannot be recalled.

`npm run test:files` serves the production frontend for the pin flow with
synthetic encrypted grants and simulated API responses. It interrupts a
multi-part pin and retries, closes the online tab, and opens the shelf in
a new tab with the browser offline. It verifies wrong and correct recovery
keys, manual lock and remembered-browser unlock, byte-for-byte export, and
revocation on reconnect followed by a second offline load.
