# M-07: offline pins for shared originals

In **Invitations**, open a verified shared project and select **Make available
offline** beside an original. The browser verifies each encrypted part before
storing it in the recipient's vault. The filename and original key are sealed
under the vault key. The pin appears under **Offline originals** only after the
complete download and a final access check. A cancelled or failed download is
discarded; retry starts a fresh download. Unfinished rows left by an abrupt tab
exit are hidden and pruned by the existing staging cleanup after 24 hours.

Use **Save a copy** while disconnected in the unlocked invitation workspace.
Pins survive a reload and vault lock; the current app still needs a connection
to establish the account session and load the workspace after a cold start.
**Remove offline copy** releases this browser's pin without changing the
shared original. Forgetting the vault removes all local pins. Originals
attached by the owner already reside in that owner's encrypted local store.

When the invitation workspace is opened online or reconnects, it checks each
pin against the existing per-file grant endpoint. An online open also checks
access. A definitive denial deletes the cached ciphertext and sealed key.
Transient failures prevent an online open and leave the pin for a later check.
A device cannot learn revocation while disconnected. Copies already exported
from the app cannot be recalled.

`npm run test:files` covers the invitation UI with synthetic encrypted grants
and simulated server responses. It interrupts a multi-part pin and retries,
reopens the workspace, compares an offline download byte for byte, and confirms
that denial on reconnect removes the pin across reloads.
