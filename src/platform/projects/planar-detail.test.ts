import { describe, expect, it } from 'vitest';
import { assertDrawing, commitDrawing } from './drawing-state';
import {
  budgetSides,
  capSides,
  maxCapSides,
  minCapSides,
  sourceTolerance,
  validTolerance,
} from './planar-detail';
import { drawMask, markFootprint } from './planar-drawing';
import type { DrawingLayer, DrawingMark } from './planar-drawing';
import { coveredAreas, maxEdges } from './planar-mask';
import { newPlanarSurface } from './planar-state';
import { rect } from './planar-transform';
import type { Mask, SourceFrame } from './planar-types';

const frame = (width: number): SourceFrame => ({
  id: `photo-${width}`,
  width,
  height: width / 2,
  embeddedPreview: false,
});
// A brush expressed as a share of the raster width, as the editor stores it.
const dot = (source: SourceFrame, percent: number, tolerance?: number): DrawingMark => ({
  id: 1,
  action: 'stroke',
  operation: 'add',
  closed: false,
  width: (percent * source.width) / 100,
  region: rect([0, 0, source.width, source.height]),
  points: [{ at: [source.width / 2, source.height / 2] }],
  ...(tolerance !== undefined && { tolerance }),
});
const layer = (marks: DrawingMark[]): DrawingLayer => ({
  id: 1,
  kind: 'master',
  name: '',
  parent: 0,
  visible: true,
  locked: false,
  expanded: true,
  opacity: 0,
  color: '#000000',
  fill: 'none',
  outline: false,
  marks,
});
const edges = (mask: Mask) => mask.reduce((sum, ring) => sum + ring.length, 0);
const sagitta = (radius: number, sides: number) => radius * (1 - Math.cos(Math.PI / sides));
const area = (mask: Mask) => coveredAreas([mask], (filled) => filled)[0]!;

describe('source-pixel mask detail (MASK-05)', () => {
  it('keeps each cap within the source-pixel tolerance until the side ceiling', () => {
    for (const radius of [1, 8, 13, 20, 40, 80, 150, 207]) {
      const sides = capSides(radius, sourceTolerance);
      expect(sides % 4).toBe(0);
      expect(sides).toBeGreaterThanOrEqual(minCapSides);
      expect(sides).toBeLessThanOrEqual(maxCapSides);
      expect(sagitta(radius, sides)).toBeLessThanOrEqual(sourceTolerance);
    }
    expect(capSides(1000, sourceTolerance)).toBe(maxCapSides);
    expect(sagitta(1000, maxCapSides) / 1000).toBeLessThan(0.0012046);
  });

  it('adds cap detail as the source resolution grows for the same relative brush', () => {
    const sides = [1000, 4000, 8000].map((width) => {
      const mask = markFootprint(dot(frame(width), 2, sourceTolerance));
      return edges(mask);
    });
    expect(sides).toEqual([16, 32, 40]);
    // Each footprint stays within the tolerance in its own source pixels.
    [1000, 4000, 8000].forEach((width, i) =>
      expect(sagitta(width / 100, sides[i]!)).toBeLessThanOrEqual(sourceTolerance),
    );
  });

  it('reproduces marks saved before the tolerance field with 16-sided caps', () => {
    const source = frame(8000);
    const legacy = dot(source, 2);
    const radius = legacy.width / 2;
    expect(edges(markFootprint(legacy))).toBe(minCapSides);
    expect(area(markFootprint(legacy))).toBeCloseTo(8 * radius ** 2 * Math.sin(Math.PI / 8), 6);
    const saved = commitDrawing(newPlanarSurface(source), [layer([legacy])]);
    expect(edges(saved.master!)).toBe(minCapSides);
    const mixed = drawMask(
      layer([
        legacy,
        { ...dot(source, 2, sourceTolerance), id: 2, points: [{ at: [1000, 1000] }] },
      ]),
      source,
    )!;
    expect(mixed.map((ring) => ring.length).sort((a, b) => a - b)).toEqual([16, 40]);
  });

  it('bounds dense, wide strokes by the mask edge budget', () => {
    expect(budgetSides(64, 1, maxEdges * 2)).toBe(64);
    expect(budgetSides(64, 400, maxEdges * 2)).toBe(20);
    expect(budgetSides(64, 600, maxEdges * 2)).toBe(minCapSides);
    const source = frame(8000);
    const stroke: DrawingMark = {
      ...dot(source, 10, sourceTolerance),
      points: Array.from({ length: 400 }, (_, i) => ({
        at: [200 + i * 18, 2000 + (i % 2) * 600] as const,
      })),
    };
    const mask = markFootprint(stroke);
    expect(edges(mask)).toBeGreaterThan(0);
    expect(edges(mask)).toBeLessThanOrEqual(maxEdges);
  });

  it('validates stored tolerances', () => {
    expect([sourceTolerance, 1 / 64, 16].every(validTolerance)).toBe(true);
    expect([0, -1, 1 / 128, 17, Number.NaN, Infinity, '0.25'].some(validTolerance)).toBe(false);
    const source = frame(1000);
    expect(() => assertDrawing([layer([dot(source, 2)])])).not.toThrow();
    expect(() => assertDrawing([layer([dot(source, 2, sourceTolerance)])])).not.toThrow();
    expect(() => assertDrawing([layer([dot(source, 2, 0)])])).toThrow('Invalid drawing mark');
  });
});
