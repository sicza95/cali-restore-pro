import { decimal } from './decimal';
import type { AreaUnit, Measurement, Phase } from './types';
import { quantityText } from './display';

const squareMetres: Record<AreaUnit, string> = {
  'm²': '1',
  'cm²': '0.0001',
  'ft²': '0.09290304',
  'in²': '0.00064516',
};
export function convertArea(value: string, from: AreaUnit, to: AreaUnit) {
  if (!Object.hasOwn(squareMetres, from) || !Object.hasOwn(squareMetres, to))
    throw new Error('Incompatible area unit');
  return decimal(value).mul(decimal(squareMetres[from])).div(decimal(squareMetres[to]));
}
export function changeFactor(
  phase: Phase,
  next: string,
  decision: 'keep' | 'adjust' | 'cancel',
): Partial<Phase> {
  if (decision === 'cancel') return { factorDraft: undefined };
  const factor = decimal(next);
  const old = decimal(phase.multiplier);
  if (!factor.positive() || !old.positive()) throw new Error('Invalid factor');
  return {
    multiplier: next,
    factorDraft: undefined,
    ...(phase.mode === 'time' && decision === 'adjust'
      ? { time: quantityText(decimal(phase.time).mul(factor).div(old).round(18)) }
      : {}),
  };
}
export function areaChange(
  previous: Measurement | undefined,
  next: Measurement,
  mode: Phase['mode'],
) {
  if (
    !previous ||
    previous.validity !== 'valid' ||
    next.validity !== 'valid' ||
    previous.area === null ||
    next.area === null
  )
    return next.validity === 'valid' ? 'none' : 'unavailable';
  const a = convertArea(previous.area, previous.unit, 'm²');
  const b = convertArea(next.area, next.unit, 'm²');
  return a.n * b.d === b.n * a.d ? 'none' : mode === 'time' ? 'review-hours' : 'recalculate';
}
