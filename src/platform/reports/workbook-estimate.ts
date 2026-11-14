import { nonnegative, decimal } from '../estimates/decimal';
import { convertArea } from '../estimates/units';
import type { EstimateSnapshot } from '../estimates/types';
import { coversEstimate } from './estimate';
import type { PreviewSurface } from './types';

function number(value: string, blank = false) {
  return Number(decimal(blank && !value.trim() ? '0' : value).round(18));
}

export type WorkbookEstimate = ReturnType<typeof workbookEstimate>;

// The caller supplies the explicitly selected issued version from the owner's vault.
// Project IDs, phase IDs, inactive rates, preset references and raw measurements
// are unnecessary in a detached workbook.
export function workbookEstimate(snapshot: EstimateSnapshot, surfaces: PreviewSurface[]) {
  if (!snapshot.issued || !coversEstimate(snapshot, surfaces)) throw new Error('Estimate scope');
  const { input, result } = snapshot;
  const objects = input.objects.filter(({ id }) => input.selected.includes(id));
  return {
    currency: input.currency,
    precision: result.precision,
    assumptions: input.assumptions,
    tax: input.tax.enabled ? number(input.tax.rate) : 0,
    objects: objects.map((object) => object.name),
    phases: result.phases.map((calculated) => {
      const phase = input.phases.find(({ id }) => id === calculated.id)!;
      const object = objects.findIndex(({ surfaces }) => surfaces.includes(phase.surface));
      const surface = surfaces.find(({ id }) => id === phase.surface);
      if (object < 0 || !surface || phase.archived) throw new Error('Phase scope');
      const quantity = phase.quantity;
      const area =
        calculated.issues.includes('area-unavailable') || !quantity?.area
          ? null
          : Number(convertArea(quantity.area, quantity.unit, phase.units).round(18));
      return {
        object,
        surface: surface.name,
        name: phase.name,
        unit: phase.units,
        area,
        assessment: surface.assessments?.find(({ id }) => id === quantity?.assessment)?.name,
        currentAssessment:
          quantity?.source === 'committed' &&
          quantity.validity === 'valid' &&
          (quantity.assessment ?? 'current') === 'current',
        mode: phase.mode,
        time: phase.mode === 'time' ? number(phase.time) : null,
        productivity:
          phase.mode === 'productivity' ? number(phase.productivity[phase.units]!) : null,
        multiplier: number(phase.multiplier),
        method: phase.price,
        rate: number(phase.rate[phase.price === 'area' ? phase.units : phase.price]!),
        material: number(phase.material, true),
        hours: calculated.hours === null ? null : number(calculated.hours),
        effective: calculated.productivity === null ? null : number(calculated.productivity),
        baseline: calculated.baseline === null ? null : number(calculated.baseline),
        work: calculated.work === null ? null : number(calculated.work),
        subtotal: calculated.subtotal === null ? null : number(calculated.subtotal),
      };
    }),
    extras: input.extras
      .filter((extra) => extra.included && (!extra.object || input.selected.includes(extra.object)))
      .map((extra) => {
        const rate = extra.rate[extra.method]!;
        const hours = nonnegative(extra.hours, extra.method === 'fixed');
        const amount = extra.method === 'hourly' ? hours.mul(decimal(rate)) : decimal(rate);
        return {
          object: extra.object ? objects.findIndex(({ id }) => id === extra.object) : null,
          name: extra.name,
          method: extra.method,
          hours: Number(hours.round(18)),
          rate: number(rate),
          amount: Number(amount.round(result.precision)),
        };
      }),
    adjustments: input.adjustments.map((adjustment, index) => ({
      name: adjustment.name,
      percent: number(adjustment.percent),
      amount: number(result.adjustments[index]!.amount),
    })),
    result: {
      objects: result.objects.map(({ subtotal }) => (subtotal === null ? null : number(subtotal))),
      extras: number(result.extras),
      hours: result.hours === null ? null : number(result.hours),
      subtotal: result.subtotal === null ? null : number(result.subtotal),
      beforeTax: result.beforeTax === null ? null : number(result.beforeTax),
      tax: result.taxTotal === null ? null : number(result.taxTotal),
      total: result.total === null ? null : number(result.total),
    },
  };
}
