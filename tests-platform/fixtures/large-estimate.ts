import type { EstimateInput, Phase } from '../../src/platform/estimates/types';

const id = () => crypto.randomUUID();

/**
 * A large estimate, heavier per phase than the app writes: every phase is measured on its own
 * phase layer with two presets, every id is a UUID, and the assumptions use the full 1000
 * characters in accented Hungarian.
 */
export function largeEstimate(
  objects: number,
  surfaces: number,
  phasesPerSurface: number,
  project: string = id(),
): EstimateInput {
  const rows = Array.from({ length: objects }, (_, n) => ({
    id: id(),
    name: `Object ${n + 1}: north aisle altarpiece`,
    surfaces: Array.from({ length: surfaces }, id),
  }));
  const phases: Phase[] = rows.flatMap((object) =>
    object.surfaces.flatMap((surface) =>
      Array.from({ length: phasesPerSurface }, (_, n): Phase => {
        const phase = id();
        const scope = id();
        return {
          id: phase,
          name: `Surface cleaning and consolidation ${n + 1}`,
          archived: false,
          surface,
          scope,
          scopeSource: id(),
          assessment: id(),
          measurement: 'ready',
          quantity: {
            version: 1,
            project,
            object: object.id,
            surface,
            phase,
            scope,
            revision: ['12', id(), '7', '3'].join('/'),
            calibration: id(),
            assessment: id(),
            source: 'committed',
            validity: 'valid',
            area: '12.3456',
            unit: 'm²',
          },
          mode: 'productivity',
          time: '12.5',
          productivity: { 'm²': '0.75' },
          multiplier: '1.15',
          price: 'area',
          rate: { 'm²': '18500', hourly: '9500' },
          material: '12500.50',
          units: 'm²',
          presets: [
            { id: id(), version: 2 },
            { id: id(), version: 1 },
          ],
        };
      }),
    ),
  );
  return {
    schema: 1,
    project,
    revision: 42,
    currency: 'HUF',
    priceCurrency: 'HUF',
    objects: rows,
    selected: rows.map((object) => object.id),
    phases,
    extras: Array.from({ length: 5 }, (_, n) => ({
      id: id(),
      name: `Scaffolding rental ${n + 1}`,
      object: rows[0].id,
      method: 'hourly' as const,
      hours: '8',
      rate: { hourly: '9500' },
      included: true,
    })),
    adjustments: Array.from({ length: 3 }, (_, n) => ({
      id: id(),
      name: `Discount ${n + 1}`,
      percent: '-5',
    })),
    tax: { enabled: true, rate: '27' },
    assumptions: 'Árvíztűrő tükörfúrógép, '.repeat(42).slice(0, 1000),
  };
}

/** Gives every object and phase an 80-character name, and the assumptions 1000 characters. */
export function withLongNames(input: EstimateInput, letter: string): EstimateInput {
  const name = letter.repeat(80);
  input.objects.forEach((object) => (object.name = name));
  input.phases.forEach((phase) => (phase.name = name));
  input.extras.forEach((extra) => (extra.name = name));
  input.adjustments.forEach((adjustment) => (adjustment.name = name));
  input.assumptions = letter.repeat(1000);
  return input;
}
