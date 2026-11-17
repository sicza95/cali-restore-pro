import type { Page } from '@playwright/test';

export const fixture = { width: 8192, height: 4096 };
/** The raw mask export caps at 32 Mpx (`assertRawMask`), so 8192 x 4096 does not fit it. */
export const exportSize = { width: 8000, height: 4000 };

/**
 * A synthetic 8192 x 4096 JPEG (quality 0.9), drawn in the page: gradient, brick courses, cracks and
 * a tiled noise texture, about 10 MB like a camera file. No real photo. PNG is avoided on purpose:
 * the importer rejects a PNG with more than 4096 chunks, which an 8K PNG of any texture exceeds.
 */
export async function syntheticJpeg(page: Page, { width, height } = fixture) {
  return Buffer.from(
    await page.evaluate(
      async ({ width, height }) => {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#b9b3a4');
        gradient.addColorStop(1, '#8a8274');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#6d665a';
        ctx.lineWidth = 9;
        const brick = { w: 512, h: 192 };
        for (let row = 0; row * brick.h < height; row++)
          for (let col = -1; col * brick.w < width; col++)
            ctx.strokeRect(
              col * brick.w + (row % 2 ? brick.w / 2 : 0),
              row * brick.h,
              brick.w,
              brick.h,
            );
        ctx.strokeStyle = '#3d382f';
        ctx.lineWidth = 5;
        for (let i = 0; i < 400; i++) {
          const x = (i * 7919) % width;
          const y = (i * 104729) % height;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 40 + (i % 90), y + 20 + (i % 60));
          ctx.stroke();
        }
        const tile = new OffscreenCanvas(256, 256);
        const tileCtx = tile.getContext('2d')!;
        const noise = tileCtx.createImageData(256, 256);
        let seed = 12345;
        for (let i = 0; i < noise.data.length; i += 4) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          noise.data.fill((seed >>> 24) & 255, i, i + 3);
          noise.data[i + 3] = 255;
        }
        tileCtx.putImageData(noise, 0, 0);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      },
      { width, height },
    ),
    'base64',
  );
}
