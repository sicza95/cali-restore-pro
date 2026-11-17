import { expect, it } from 'vitest';
import { updateMeasuredPhase } from './assessment-quantity';
import type { Phase } from './types';

it('keeps the previous measurement and manual inputs when measurement is unavailable', () => {
  const phase = {
    id: 'x',
    surface: 's',
    scope: 'a',
    measurement: 'ready',
    mode: 'time',
    time: '4',
    rate: { hourly: '12' },
    material: '8',
    quantity: { source: 'committed', validity: 'valid', area: '3' },
  } as unknown as Phase;
  const next = { ...phase, ...updateMeasuredPhase(phase, undefined) };
  expect(next.quantity).toMatchObject({ validity: 'stale', area: '3' });
  expect(next).toMatchObject({
    time: '4',
    rate: { hourly: '12' },
    material: '8',
    measurement: 'missing',
  });
});
