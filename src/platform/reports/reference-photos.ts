import type { LocalVault } from '../vault/vault';

export async function referencePhoto(
  vault: LocalVault,
  project: string,
  id: string,
  signal: AbortSignal,
) {
  const { proxy } = await vault.files().workingImage({ project, id }, { signal });
  const bitmap = await createImageBitmap(proxy);
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    signal.throwIfAborted();
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return 'data:image/jpeg;base64,' + btoa(binary);
  } finally {
    bitmap.close();
  }
}
