export const fixtureIds = ['baseline', 'followup'] as const;
export type FixtureId = (typeof fixtureIds)[number];
export const checkpointFixtures = {
  baseline: { area: 6, layer: 0.42, category: 0.78, unique: 0.92, crop: 100, left: 32, width: 45 },
  followup: { area: 5.8, layer: 0.36, category: 0.71, unique: 0.85, crop: 96, left: 44, width: 40 },
} satisfies Record<FixtureId, Record<string, number>>;
export const measurementStates = ['ready', 'stale', 'missing', 'computing', 'error'] as const;
export type MeasurementState = (typeof measurementStates)[number];
