import { proposePlanarMatch } from './planar-match';

async function thumb(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 88 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const g = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0, width, height);
    const { data } = g.getImageData(0, 0, width, height);
    const grey = new Uint8Array(width * height);
    for (let i = 0; i < grey.length; i++)
      grey[i] = (data[4 * i]! * 3 + data[4 * i + 1]! * 6 + data[4 * i + 2]!) / 10;
    return { width, height, grey };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<{ detail: Blob; reference: Blob }>) => {
  try {
    const [detail, reference] = await Promise.all([
      thumb(event.data.detail),
      thumb(event.data.reference),
    ]);
    const hits = proposePlanarMatch(detail, reference);
    self.postMessage(
      hits?.map((hit) => ({
        start: {
          x: String(((hit.detail[0] + 0.5) / detail.width) * 100),
          y: String(((hit.detail[1] + 0.5) / detail.height) * 100),
        },
        end: {
          x: String(((hit.reference[0] + 0.5) / reference.width) * 100),
          y: String(((hit.reference[1] + 0.5) / reference.height) * 100),
        },
      })) ?? null,
    );
  } catch {
    self.postMessage(null);
  }
};
