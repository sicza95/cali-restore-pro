import { createDecipheriv } from 'node:crypto';
import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export async function captureOriginalKey(page: Page) {
  let oldKey = '';
  await page.exposeFunction('captureOriginalKey', (value: string) => {
    oldKey = value;
  });
  await page.addInitScript(() => {
    const decrypt = SubtleCrypto.prototype.decrypt;
    SubtleCrypto.prototype.decrypt = async function (algorithm, key, data) {
      const result = await decrypt.call(this, algorithm, key, data);
      try {
        const envelope = JSON.parse(new TextDecoder().decode(result));
        if (envelope.originals?.[0]?.key)
          await (
            window as unknown as { captureOriginalKey: (key: string) => Promise<void> }
          ).captureOriginalKey(envelope.originals[0].key);
      } catch {
        // Most decrypted records do not contain sharing metadata.
      }
      return result;
    };
  });
  return () => oldKey;
}

/** The pre-rotation original key must no longer open a rotated original's first part. */
export async function expectOldKeyRejected(
  owner: APIRequestContext,
  ciphertext: Buffer,
  oldKey: string,
  projectId: string,
  fileId: string,
) {
  const ownerAccount = await (await owner.get('/api/v1/auth/me')).json();
  const iv = Buffer.alloc(12);
  iv.writeUInt32BE(1, 8);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(oldKey, 'base64'), iv);
  decipher.setAAD(
    Buffer.from(
      JSON.stringify(['calirestore-original', 1, ownerAccount.account.id, projectId, fileId, 1]),
    ),
  );
  decipher.setAuthTag(ciphertext.subarray(-16));
  decipher.update(ciphertext.subarray(0, -16));
  expect(() => decipher.final()).toThrow();
}
