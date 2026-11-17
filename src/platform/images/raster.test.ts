import { describe, expect, it } from 'vitest';
import { pngFrame } from './raster';
import { ImageSource } from './source';

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type: string, length: number) => [
  ...u32(length),
  ...[...type].map((c) => c.charCodeAt(0)),
  ...new Array<number>(length).fill(0), // pngFrame never checks CRCs or content
  0,
  0,
  0,
  0,
];

function png(width: number, height: number, idat: number[], end = chunk('IEND', 0)) {
  const header = chunk('IHDR', 13);
  header.splice(8, 8, ...u32(width), ...u32(height));
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...header, ...idat, ...end]);
}

const source = (bytes: Uint8Array) =>
  new ImageSource(bytes.length, async (a, b) => bytes.slice(a, b).buffer as ArrayBuffer);

describe('pngFrame', () => {
  it('accepts an 8K PNG whose IDAT data is split into more than 4096 small chunks', async () => {
    const idat: number[] = [];
    for (let i = 0; i < 5000; i++) idat.push(...chunk('IDAT', 4096));
    const bytes = png(7680, 4320, idat);
    expect(bytes.length).toBeGreaterThan(16 * 1024 ** 2);
    await expect(pngFrame(source(bytes))).resolves.toEqual({
      width: 7680,
      height: 4320,
      orientation: undefined,
    });
  });

  it('accepts tiny empty chunks beyond the old count limit', async () => {
    const idat = [...chunk('IDAT', 1)];
    for (let i = 0; i < 6000; i++) idat.push(...chunk('tEXt', 0));
    await expect(pngFrame(source(png(10, 10, idat)))).resolves.toMatchObject({ width: 10 });
  });

  it('rejects truncated, overlong, trailing-data and image-less files', async () => {
    const idat = chunk('IDAT', 100);
    const good = png(10, 10, idat);
    await expect(pngFrame(source(good.slice(0, good.length - 5)))).rejects.toThrow('invalid');
    await expect(pngFrame(source(good.slice(0, 60)))).rejects.toThrow('invalid');
    await expect(pngFrame(source(new Uint8Array([...good, 0])))).rejects.toThrow('invalid');
    await expect(pngFrame(source(png(10, 10, [])))).rejects.toThrow('invalid');
    const huge = chunk('IDAT', 4);
    huge.splice(0, 4, ...u32(0xffffffff));
    await expect(pngFrame(source(png(10, 10, huge)))).rejects.toThrow('invalid');
    const past = chunk('IDAT', 4);
    past.splice(0, 4, ...u32(1000));
    await expect(pngFrame(source(png(10, 10, past)))).rejects.toThrow('invalid');
  });

  it('rejects oversized dimensions and a chunk flood', async () => {
    await expect(pngFrame(source(png(12289, 10, chunk('IDAT', 1))))).rejects.toThrow('limit');
    const idat = chunk('IDAT', 0);
    const run: number[] = [];
    for (let i = 0; i < 1024 ** 2 + 1; i++) run.push(...chunk('tEXt', 0));
    await expect(pngFrame(source(png(10, 10, [...idat, ...run])))).rejects.toThrow('limit');
  });

  it('never reads outside the blob', async () => {
    const idat = chunk('IDAT', 20_000);
    const bytes = png(10, 10, idat);
    const reads: [number, number][] = [];
    const spy = new ImageSource(bytes.length, async (a, b) => {
      reads.push([a, b]);
      return bytes.slice(a, b).buffer as ArrayBuffer;
    });
    await pngFrame(spy);
    expect(reads.every(([a, b]) => a >= 0 && a <= b && b <= bytes.length)).toBe(true);
  });
});
