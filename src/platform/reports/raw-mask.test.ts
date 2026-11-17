import { describe, expect, it } from 'vitest';
import { newPlanarSurface, preparePhoto } from '../projects/planar-state';
import { rect } from '../projects/planar-transform';
import { maxEdges } from '../projects/planar-mask';
import { exportReport } from './export';
import { assertRawMask, rawMaskExport } from './raw-mask';

const source = { id: 'photo', width: 200, height: 100, embeddedPreview: false };
const state = {
  ...newPlanarSurface(source),
  layers: [
    { id: 'one', kind: 'damage' as const, mask: [rect([10, 20, 30, 40])] },
    { id: 'two', kind: 'phase' as const, mask: [] },
  ],
};

describe('raw mask export', () => {
  it('selects only the requested layer in original pixels despite photo preparation', () => {
    const prepared = preparePhoto(state, source, {
      ...state.frame.input,
      crop: [50, 10, 100, 80],
      rotation: 90,
      flip: true,
    });
    expect(rawMaskExport(prepared, 'one')).toEqual({
      kind: 'raw-mask',
      format: 'PNG',
      width: 200,
      height: 100,
      mask: state.layers[0]!.mask,
    });
    expect(rawMaskExport(prepared, 'two').mask).toEqual([]);
    expect(() => rawMaskExport(state, 'missing')).toThrow('unavailable');
  });

  it.each([0, -1, 1.5, NaN, Infinity, 32768])('rejects invalid dimensions %s', (width) => {
    expect(() => assertRawMask({ ...rawMaskExport(state, 'one'), width })).toThrow('size limit');
  });

  it('enforces pixel and geometry budgets before starting a worker', () => {
    const payload = rawMaskExport(state, 'one');
    const signal = new AbortController().signal;
    expect(() => exportReport({ ...payload, width: 8000, height: 8000 }, signal)).toThrow(
      'size limit',
    );
    expect(() =>
      exportReport(
        {
          ...payload,
          mask: [
            [
              [NaN, 0],
              [1, 0],
              [1, 1],
            ],
          ],
        },
        signal,
      ),
    ).toThrow('coordinate');
    expect(() =>
      assertRawMask({
        ...payload,
        mask: [Array.from({ length: maxEdges + 1 }, () => [0, 0] as const)],
      }),
    ).toThrow('ring');
  });

  it('honours an already aborted signal before starting a worker', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => exportReport(rawMaskExport(state, 'one'), controller.signal)).toThrow('aborted');
  });
});
