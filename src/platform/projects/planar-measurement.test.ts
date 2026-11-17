import { describe, expect, it } from 'vitest';
import { measurePlanar, resultStatus } from './planar-measurement';
import { calibrate, newPlanarSurface } from './planar-state';
import { rect } from './planar-transform';
import type { PlanarSurface, SourceFrame } from './planar-types';

const source: SourceFrame = { id: 'photo', width: 200, height: 100, embeddedPreview: false };

// 200 × 100 px photo calibrated as 2 m × 1 m: one pixel is 0.01 m, so 1 px² = 0.0001 m².
function surface(): PlanarSurface {
  const calibrated = calibrate(newPlanarSurface(source), {
    method: 'dimensions',
    unit: 'm',
    width: 2,
    height: 1,
  });
  return {
    ...calibrated,
    categories: [{ id: 'cracks' }],
    layers: [
      // Damage A: x 0–50, all rows = 5000 px². Damage B: x 25–75 = 5000 px², 2500 overlapping A.
      { id: 'damage-a', kind: 'damage', parent: 'cracks', mask: [rect([0, 0, 50, 100])] },
      { id: 'damage-b', kind: 'damage', mask: [rect([25, 0, 50, 100])] },
      // A phase scope is not damage: x 100–200 = 10000 px².
      { id: 'phase-1', kind: 'phase', mask: [rect([100, 0, 100, 100])] },
    ],
  };
}

describe('measurePlanar', () => {
  const state = surface();
  const result = measurePlanar(state, 7);

  it('measures the assessed area in pixels, square metres and percent', () => {
    expect(result.assessed.pixels2).toBeCloseTo(20_000, 6);
    expect(result.assessed.areaM2).toEqual({ status: 'valid', value: expect.closeTo(2, 9) });
    expect(result.assessed.percent.value).toBeCloseTo(100, 9);
  });

  it('counts overlapping damage once', () => {
    // Union of x 0–75 = 7500 px² = 0.75 m² = 37.5 %.
    expect(result.damage.pixels2).toBeCloseTo(7500, 6);
    expect(result.damage.areaM2.value).toBeCloseTo(0.75, 9);
    expect(result.damage.percent.value).toBeCloseTo(37.5, 9);
  });

  it('measures each layer and category', () => {
    const layers = Object.fromEntries(result.layers.map((l) => [l.id, l.areaM2.value]));
    expect(layers['damage-a']).toBeCloseTo(0.5, 9);
    expect(layers['damage-b']).toBeCloseTo(0.5, 9);
    expect(layers['phase-1']).toBeCloseTo(1, 9);
    expect(result.categories).toEqual([
      expect.objectContaining({ id: 'cracks', pixels2: expect.closeTo(5000, 6) }),
    ]);
  });

  it('clips layers to the crop', () => {
    const cropped = {
      ...state,
      frame: { ...state.frame, input: { ...state.frame.input, crop: [0, 0, 100, 100] as const } },
    };
    const clipped = measurePlanar({ ...cropped, calibration: undefined }, 7);
    // Crop x 0–100: damage x 0–75 = 7500 of 10000 px²; the phase layer at x 100+ is outside.
    expect(clipped.assessed.pixels2).toBeCloseTo(10_000, 6);
    expect(clipped.damage.percent.value).toBeCloseTo(75, 9);
    expect(clipped.layers.find((l) => l.id === 'phase-1')!.pixels2).toBeCloseTo(0, 9);
    expect(clipped.damage.areaM2).toEqual({ status: 'unavailable', value: null });
  });

  it('keeps coverage unavailable, never zero, when nothing is assessed (MEAS-06)', () => {
    const empty = measurePlanar({ ...state, calibration: undefined, master: [] }, 7);
    expect(empty.assessed.pixels2).toBe(0);
    expect(empty.damage.percent).toEqual({ status: 'unavailable', value: null });
    expect(empty.assessed.percent).toEqual({ status: 'unavailable', value: null });
  });

  it('marks the area invalid once the frame moves past the calibration', () => {
    const moved = { ...state, revision: state.revision + 1 };
    moved.frame = { ...state.frame, revision: moved.revision };
    expect(measurePlanar(moved, 7).assessed.areaM2).toEqual({ status: 'invalid', value: null });
  });

  it('reports the result status', () => {
    expect(resultStatus(result, state, 7, 'idle')).toBe('valid');
    expect(resultStatus(result, state, 8, 'idle')).toBe('stale');
    expect(resultStatus(result, { ...state, revision: state.revision + 1 }, 7, 'idle')).toBe(
      'stale',
    );
    expect(resultStatus(undefined, state, 7, 'running')).toBe('pending');
    expect(resultStatus(result, state, 7, 'error')).toBe('failed');
    expect(resultStatus(undefined, state, 7, 'idle')).toBe('unavailable');
  });
});
