import type { Mask, PlanarSurface } from '../projects/planar-types';
import { assertMask } from '../projects/planar-mask';
import { assertDimensions } from '../images/types';

export type RawMaskExport = {
  kind: 'raw-mask';
  format: 'PNG';
  width: number;
  height: number;
  mask: Mask;
};

// The mask is exported at the source's native size, so it accepts exactly what the importer
// accepts (assertDimensions: 12288 per side, 40 Mi pixels), which covers 7680x4320 and 8192x4096.
// Memory: the export canvas is RGBA, 4 bytes per pixel, so 40 Mi px is at most 160 MiB, once, in
// the export worker. The PNG is bounded separately by the 32 MB check in export-png.ts.
export function assertRawMask(value: RawMaskExport) {
  const { width, height } = value;
  try {
    assertDimensions(width, height);
  } catch {
    throw new Error('Mask size limit');
  }
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
