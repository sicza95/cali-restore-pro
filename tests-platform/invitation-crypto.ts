import type { Page } from '@playwright/test';

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
