import type { Mask, PlanarSurface } from '../projects/planar-types';
import { assertMask } from '../projects/planar-mask';

export type RawMaskExport = {
  kind: 'raw-mask';
  format: 'PNG';
  width: number;
  height: number;
  mask: Mask;
};

export function assertRawMask(value: RawMaskExport) {
  const { width, height } = value;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 32767 ||
    height > 32767 ||
    width * height > 32_000_000
  )
    throw new Error('Mask size limit');
  assertMask(value.mask);
}

export function rawMaskExport(state: PlanarSurface, layerId: string): RawMaskExport {
  const layer = state.layers.find(({ id }) => id === layerId);
  if (!layer) throw new Error('Mask layer unavailable');
  const value: RawMaskExport = {
    kind: 'raw-mask',
    format: 'PNG',
    width: state.source.width,
    height: state.source.height,
    mask: layer.mask,
  };
  assertRawMask(value);
  return value;
}
