import { imageLimit, invalidImage } from './types';

export const maxEncodedRaster = 64 * 1024 ** 2;

export type ReadRange = (start: number, end: number) => Promise<ArrayBuffer>;

export class ImageSource {
  constructor(
    readonly size: number,
    private readonly read: ReadRange,
  ) {}

  slice(start: number, end: number) {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.size
    )
      throw invalidImage();
    return new ImageSource(end - start, (a, b) => this.read(start + a, start + b));
  }

  arrayBuffer() {
    if (this.size > maxEncodedRaster) throw imageLimit();
    return this.read(0, this.size);
  }

  async blob(type: string) {
    return new Blob([await this.arrayBuffer()], { type });
  }
}
