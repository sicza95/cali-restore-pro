import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { validDecimal } from './fields';
export type { Phase, Extra, Adjustment } from '../../../platform/estimates/types';
import type { Phase, Extra } from '../../../platform/estimates/types';

export const modes = ['time', 'productivity'] as const;
export const methods = ['hourly', 'fixed', 'area'] as const;
export const estimateUnits = ['m²', 'cm²', 'ft²', 'in²'] as const;
export type EstimateUnit = (typeof estimateUnits)[number];
export const smallestPositive = Number.MIN_VALUE;

function newPhase(name: string, units: EstimateUnit): Phase {
  return {
    id: crypto.randomUUID(),
    name,
    archived: false,
    surface: '',
    scope: '',
    measurement: 'missing',
    mode: 'time',
    time: '',
    productivity: {},
    multiplier: '1',
    price: 'hourly',
    rate: {},
    material: '',
    units,
  };
}

export const phaseRateKey = (phase: Phase) => (phase.price === 'area' ? phase.units : phase.price);
export const phaseEffort = (phase: Phase) =>
  phase.mode === 'time' ? phase.time : (phase.productivity[phase.units] ?? '');
export const phaseRate = (phase: Phase) => phase.rate[phaseRateKey(phase)] ?? '';
export const phaseRateUnit = (phase: Phase, currency: string) =>
  currency + { hourly: '/h', fixed: '', area: '/' + phase.units }[phase.price];
export const extraRate = (extra: Extra) => extra.rate[extra.method] ?? '';
export function copyPhase(phase: Phase): Phase {
  return { ...phase, rate: { ...phase.rate }, productivity: { ...phase.productivity } };
}

export function phaseValid(phase: Phase) {
  return (
    phase.factorDraft === undefined &&
    !!phase.name.trim() &&
    !!phase.surface &&
    validDecimal(phaseEffort(phase), phase.mode === 'time' ? 0 : smallestPositive) &&
    validDecimal(phase.multiplier, smallestPositive) &&
    validDecimal(phaseRate(phase)) &&
    validDecimal(phase.material, 0, undefined, false)
  );
}

export function createPhases(defaultUnit: () => EstimateUnit) {
  const [rows, setRows] = createStore<Phase[]>([]);
  const [selected, select] = createSignal('');
  const active = () => rows.filter((item) => !item.archived);
  const current = () => active().find((item) => item.id === selected()) ?? active()[0];
  const update = (id: string, next: Partial<Phase>) => setRows((row) => row.id === id, next);
  function insert(phase: Phase) {
    setRows(rows.length, phase);
    select(phase.id);
  }
  function move(offset: number) {
    const list = active();
    const from = list.findIndex(({ id }) => id === current()?.id);
    const to = list[from + offset];
    if (!to) return;
    const next = [...rows];
    const a = next.findIndex(({ id }) => id === current()?.id);
    const b = next.findIndex(({ id }) => id === to.id);
    [next[a], next[b]] = [next[b]!, next[a]!];
    setRows(next);
  }
  return {
    rows,
    replace: (next: Phase[]) => setRows(next),
    active,
    current,
    select,
    update,
    move,
    add: (name: string) => insert(newPhase(name, defaultUnit())),
    duplicate: (phase: Phase, name: string) =>
      insert({
        ...copyPhase(phase),
        id: crypto.randomUUID(),
        name,
        scope: phase.scope ? crypto.randomUUID() : '',
      }),
    split: (phase: Phase, name: string) =>
      insert({ ...newPhase(name, phase.units), surface: phase.surface }),
    combine: (phase: Phase, other: Phase, name: string) => {
      if (phase.surface !== other.surface || !phase.surface) return;
      update(phase.id, { archived: true });
      update(other.id, { archived: true });
      insert({ ...newPhase(name, phase.units), surface: phase.surface });
    },
  };
}
export type PhaseModel = ReturnType<typeof createPhases>;
