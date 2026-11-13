import { crc32 } from './export-bytes';

const signature = [137, 80, 78, 71, 13, 10, 26, 10];

function densityChunk(dpi: number) {
  const bytes = new Uint8Array(21);
  const view = new DataView(bytes.buffer);
  const density = Math.round(dpi / 0.0254);
  view.setUint32(0, 9);
  bytes.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, density);
  view.setUint32(12, density);
  bytes[16] = 1;
  view.setUint32(17, crc32(bytes.subarray(4, 17)));
  return bytes;
}

export async function pngWithDensity(png: Blob, dpi: number) {
  if (png.type !== 'image/png' || png.size > 32_000_000) throw new Error('PNG size limit');
  const bytes = new Uint8Array(await png.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const parts: BlobPart[] = [bytes.subarray(0, 8)];
  // Keep only the freshly encoded pixel data and palette/color information.
  const allowed = ['IHDR', 'IDAT', 'IEND', 'PLTE', 'tRNS', 'sRGB', 'gAMA', 'cHRM'];
  for (let i = 8; i + 12 <= bytes.length;) {
    const end = i + 12 + view.getUint32(i);
    if (end > bytes.length) throw new Error('Invalid PNG');
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (allowed.includes(type)) parts.push(bytes.subarray(i, end));
    if (type === 'IHDR') parts.push(densityChunk(dpi));
    if (type === 'IEND') return new Blob(parts, { type: 'image/png' });
    i = end;
  }
  throw new Error('Invalid PNG');
}

export async function cleanLogo(url?: string) {
  if (!url) return;
  const prefix = 'data:image/png;base64,';
  if (
    !url.startsWith(prefix) ||
    url.length > 350_000 ||
    !/^[a-z0-9+/]+={0,2}$/i.test(url.slice(prefix.length))
  )
    throw new Error('Invalid logo');
  const bytes = Uint8Array.from(atob(url.slice(prefix.length)), (ch) => ch.charCodeAt(0));
  if (
    bytes.length < 33 ||
    !signature.every((byte, i) => bytes[i] === byte) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR'
  )
    throw new Error('Invalid logo');
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width * height > 4_000_000) throw new Error('Logo size limit');

  // Decode and re-encode selected branding. Source metadata and appended data
  // never travel with the report pixels.
  const source = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const scale = Math.min(1, 480 / width, 200 / height);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  } finally {
    source.close();
  }
  const png = await pngWithDensity(await canvas.convertToBlob({ type: 'image/png' }), 96);
  const clean = new Uint8Array(await png.arrayBuffer());
  let binary = '';
  for (let i = 0; i < clean.length; i += 8192)
    binary += String.fromCharCode(...clean.subarray(i, i + 8192));
  return { bitmap: canvas.transferToImageBitmap(), url: prefix + btoa(binary) };
}
