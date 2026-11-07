import type { EstimateInput, Phase } from '../src/platform/estimates/types';

export function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: 'phase-a',
    name: 'Cleaning',
    archived: false,
    surface: 'surface-a',
    scope: 'mask-a',
    measurement: 'ready',
    mode: 'productivity',
    time: '10',
    productivity: { 'cm²': '2' },
    multiplier: '1',
    price: 'hourly',
    rate: { hourly: '40', fixed: '175', 'cm²': '15' },
    material: '30',
    units: 'cm²',
    quantity: {
      version: 1,
      project: 'project-a',
      object: 'object-a',
      surface: 'surface-a',
      phase: 'phase-a',
      scope: 'mask-a',
      revision: 'committed-r1',
      calibration: 'calibration-r1',
      source: 'fixture',
      validity: 'valid',
      area: '10',
      unit: 'cm²',
    },
    ...overrides,
  };
}
export function input(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    schema: 1,
    project: 'project-a',
    revision: 1,
    currency: 'EUR',
    priceCurrency: 'EUR',
    objects: [
      { id: 'object-a', name: 'Panel', surfaces: ['surface-a'] },
      { id: 'object-b', name: 'Frame', surfaces: ['surface-b'] },
    ],
    selected: ['object-a'],
    phases: [phase()],
    extras: [],
    adjustments: [],
    tax: { enabled: false, rate: '20' },
    assumptions: 'Private access details',
    ...overrides,
  };
}
