/** The server keeps a 256 px square JPEG: enough for a sharp avatar on a 2× screen. */
const side = 256;
/** Larger files are refused before decoding, so a huge image never stalls the page. */
const maxFileBytes = 40 * 1024 * 1024;

/**
 * Crops the middle square of an image file, scales it to 256 px and encodes it as JPEG.
 * Returns base64 without a data-URL prefix, as the profile requests expect it.
 */
export async function squarePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > maxFileBytes) throw new Error('unreadable');
  const bitmap = await createImageBitmap(file);
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context || crop < 1) throw new Error('unreadable');
    // A transparent PNG gets a white background instead of black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, side, side);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      (bitmap.width - crop) / 2,
      (bitmap.height - crop) / 2,
      crop,
      crop,
      0,
      0,
      side,
      side,
    );
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.86));
    if (!blob) throw new Error('unreadable');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  } finally {
    bitmap.close();
  }
}

/** The first letter of the name, or of the address when there is no name; '' with neither. */
export function profileInitial(name: string | undefined, email: string) {
  return ((name?.trim() || email.trim())[0] ?? '').toLocaleUpperCase();
}
