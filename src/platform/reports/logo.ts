import type { LocalVault } from '../vault/vault';

/** Materialize an asset as PNG bytes for the existing self-contained report encoders. */
export async function reportLogo(
  vault: LocalVault,
  project: string,
  assetId: string,
  signal: AbortSignal,
): Promise<string> {
  const { proxy } = await vault.files().workingImage({ project, id: assetId }, { signal });
  const bitmap = await createImageBitmap(proxy);
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Logo canvas unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await png.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192)
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    signal.throwIfAborted();
    return 'data:image/png;base64,' + btoa(binary);
  } finally {
    bitmap.close();
  }
}
