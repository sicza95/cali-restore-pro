import { decimal, nonnegative, sum } from './decimal';
import { convertArea } from './units';
import type { EstimateInput, EstimateResult, Phase, PhaseResult } from './types';

export function currencyPrecision(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
  return (
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function calculatePhase(
  phase: Phase,
  precision: number,
  project?: string,
  object?: string,
): PhaseResult {
  const issues: string[] = [];
  let productivity = null,
    baseline = null;
  let work: string | null;
  const material = nonnegative(phase.material, true).round(precision);
  const factor = decimal(phase.multiplier);
  if (!factor.positive() || phase.factorDraft !== undefined) throw new Error('Resolve factor');
  if (!phase.name.trim() || !phase.surface) throw new Error('Incomplete phase');
  const q = phase.quantity;
  const valid =
    q?.version === 1 &&
    q.validity === 'valid' &&
    q.area !== null &&
    !!q.calibration &&
    !!q.revision &&
    q.surface === phase.surface &&
    q.phase === phase.id &&
    q.scope === phase.scope &&
    !!phase.scope &&
    (!project || q.project === project) &&
    (!object || q.object === object);
  const area = valid ? convertArea(nonnegative(q.area!).round(18), q.unit, phase.units) : null;
  if (!area) issues.push('area-unavailable');
  if (phase.measurement === 'stale') issues.push('review-hours');
  let exactHours = null;
  if (phase.mode === 'time') {
    exactHours = nonnegative(phase.time);
    if (area && exactHours.positive()) {
      const effective = area.div(exactHours);
      productivity = effective.round(18);
      baseline = effective.mul(factor).round(18);
    }
  } else if (phase.mode === 'productivity') {
    const speed = decimal(phase.productivity[phase.units] ?? '');
    if (!speed.positive()) throw new Error('Invalid productivity');
    baseline = speed.round(18);
    productivity = speed.div(factor).round(18);
    if (area) exactHours = area.div(speed).mul(factor);
  } else throw new Error('Invalid effort mode');
  const hours = exactHours?.round(18) ?? null;
  const rate = nonnegative(phase.rate[phase.price === 'area' ? phase.units : phase.price] ?? '');
  if (phase.price === 'fixed') work = rate.round(precision);
  else if (phase.price === 'hourly') work = exactHours?.mul(rate).round(precision) ?? null;
  else if (phase.price === 'area') work = area?.mul(rate).round(precision) ?? null;
  else throw new Error('Invalid price method');
  return {
    id: phase.id,
    hours,
    productivity,
    baseline,
    work,
    material,
    subtotal: work === null ? null : sum([work, material]).round(precision),
    issues,
  };
}

export function calculate(input: EstimateInput): EstimateResult {
  const precision = currencyPrecision(input.currency);
  if (input.schema !== 1 || input.priceCurrency !== input.currency)
    throw new Error('Repricing required');
  if (
    new Set(input.selected).size !== input.selected.length ||
    !input.selected.length ||
    input.selected.some((id) => !input.objects.some((object) => object.id === id))
  )
    throw new Error('Invalid selection');
  const objects = input.objects.filter((object) => input.selected.includes(object.id));
  const phaseRows = input.phases.filter(
    (p) => !p.archived && objects.some((o) => o.surfaces.includes(p.surface)),
  );
  const phases = phaseRows.map((p) =>
    calculatePhase(
      p,
      precision,
      input.project,
      objects.find((o) => o.surfaces.includes(p.surface))?.id,
    ),
  );
  const extras = input.extras.filter(
    (e) => e.included && (!e.object || input.selected.includes(e.object)),
  );
  if (!phaseRows.length && !extras.length) throw new Error('Empty estimate');
  const extraRows = extras.map((e) => {
    if (!e.name.trim() || !['fixed', 'hourly'].includes(e.method)) throw new Error('Invalid extra');
    const hours = nonnegative(e.hours, e.method === 'fixed');
    const rate = nonnegative(e.rate[e.method] ?? '');
    return {
      object: e.object,
      hours: hours.round(18),
      amount: (e.method === 'hourly' ? hours.mul(rate) : rate).round(precision),
    };
  });
  const objectResults = objects.map((o) => {
    const rows = phaseRows
      .map((p, index) => (o.surfaces.includes(p.surface) ? phases[index]!.subtotal : undefined))
      .filter((s) => s !== undefined);
    return {
      id: o.id,
      name: o.name,
      subtotal: rows.includes(null)
        ? null
        : sum([
            ...(rows as string[]),
            ...extraRows.filter((e) => e.object === o.id).map((e) => e.amount),
          ]).round(precision),
    };
  });
  const projectExtras = sum(extraRows.filter((e) => !e.object).map((e) => e.amount)).round(
    precision,
  );
  const subtotal = objectResults.some((o) => o.subtotal === null)
    ? null
    : sum([...objectResults.map((o) => o.subtotal!), projectExtras]).round(precision);
  const adjustments = input.adjustments.map((a) => {
    if (!a.name.trim()) throw new Error('Invalid adjustment');
    const percent = decimal(a.percent);
    if (percent.n > 100n * percent.d || percent.n < -100n * percent.d)
      throw new Error('Invalid percentage');
    return {
      id: a.id,
      amount:
        subtotal === null
          ? '0'
          : decimal(subtotal).mul(percent).div(decimal('100')).round(precision),
    };
  });
  const beforeTax =
    subtotal === null
      ? null
      : sum([subtotal, ...adjustments.map((a) => a.amount)]).round(precision);
  const taxRate = input.tax.enabled ? nonnegative(input.tax.rate) : decimal('0');
  if (taxRate.n > 100n * taxRate.d) throw new Error('Invalid tax');
  const taxTotal =
    beforeTax === null
      ? null
      : decimal(beforeTax).mul(taxRate).div(decimal('100')).round(precision);
  const total = beforeTax === null ? null : sum([beforeTax, taxTotal!]).round(precision);
  const issues = phases.flatMap((p) => p.issues);
  return {
    calculation: 'restoration-v1',
    rounding: 'half-away-from-zero',
    precision,
    complete: total !== null && !issues.includes('review-hours'),
    illustrative: phaseRows.some((p) => p.quantity?.source === 'fixture'),
    phases,
    objects: objectResults,
    extras: projectExtras,
    adjustments,
    hours: phases.some((p) => p.hours === null)
      ? null
      : sum([...phases.map((p) => p.hours!), ...extraRows.map((e) => e.hours)]).round(18),
    subtotal,
    beforeTax,
    taxTotal,
    total,
    issues,
  };
}
