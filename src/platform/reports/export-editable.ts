import { estimateCopy } from '../estimates/copy';
import { reportCopy } from './copy';
import type { Draft } from './types';
import type { WorkbookEstimate } from './workbook-estimate';
import type { Formula, Sheet } from './export-xlsx';

const formula = (expression: string, cache: number | null): Formula => ({ expression, cache });

export function estimateSheets(draft: Draft, estimate: WorkbookEstimate): Sheet[] {
  const e = estimateCopy[draft.language];
  const c = reportCopy[draft.language];
  const hu = draft.language === 'hu';
  const object = hu ? 'Tárgy' : 'Object';
  const phase = hu ? 'Munkafázis' : 'Phase';
  const names = {
    estimate: hu ? 'Becslés' : 'Estimate',
    phases: e.phases,
    extras: e.extras,
    adjustments: hu ? 'Korrekciók' : 'Adjustments',
  };
  const precision = estimate.precision;
  const phases: Sheet = {
    name: names.phases,
    widths: [12, 24, 24, 29, 12, 15, 24, 16, 16, 16, 16, 17, 16, 16, 16, 16, 24, 24],
    rows: [
      [
        object + ' #',
        object,
        c.surface,
        phase,
        e.units,
        c.area,
        e.mode,
        e.time,
        e.productivity,
        e.multiplier,
        e.price,
        e.rate,
        e.material,
        e.hours,
        c.workPrice,
        e.subtotal,
        e.productivityOutput,
        hu ? 'Alap termelékenység' : 'Baseline productivity',
      ],
      ...estimate.phases.map((row, i) => {
        const n = i + 2;
        const hours = `IF(G${n}="time",IF(ISNUMBER(H${n}),H${n},""),IF(AND(ISNUMBER(F${n}),I${n}>0),F${n}/I${n}*J${n},""))`;
        const work = `IF(K${n}="fixed",ROUND(L${n},${precision}),IF(K${n}="hourly",IF(ISNUMBER(N${n}),ROUND(N${n}*L${n},${precision}),""),IF(ISNUMBER(F${n}),ROUND(F${n}*L${n},${precision}),"")))`;
        const effective = `IF(G${n}="time",IF(AND(ISNUMBER(F${n}),N${n}>0),F${n}/N${n},""),IF(J${n}>0,I${n}/J${n},""))`;
        const baseline = `IF(G${n}="time",IF(ISNUMBER(Q${n}),Q${n}*J${n},""),IF(I${n}>0,I${n},""))`;
        return [
          row.object + 1,
          estimate.objects[row.object]!,
          row.surface,
          row.name,
          row.unit,
          row.area,
          row.mode,
          row.time,
          row.productivity,
          row.multiplier,
          row.method,
          row.rate,
          row.material,
          formula(hours, row.hours),
          formula(work, row.work),
          formula(
            `IF(ISNUMBER(O${n}),ROUND(O${n}+ROUND(M${n},${precision}),${precision}),"")`,
            row.subtotal,
          ),
          formula(effective, row.effective),
          formula(baseline, row.baseline),
        ];
      }),
    ],
  };
  const extras: Sheet = {
    name: names.extras,
    widths: [12, 24, 29, 17, 17, 19, 16],
    rows: [
      [object + ' #', object, e.extraName, e.extraMethod, e.extraHours, e.extraRate, e.subtotal],
      ...estimate.extras.map((row, i) => {
        const n = i + 2;
        return [
          row.object === null ? 0 : row.object + 1,
          row.object === null ? e.projectExtra : estimate.objects[row.object]!,
          row.name,
          row.method,
          row.hours,
          row.rate,
          formula(`ROUND(IF(D${n}="hourly",E${n}*F${n},F${n}),${precision})`, row.amount),
        ];
      }),
    ],
  };
  const adjustments: Sheet = {
    name: names.adjustments,
    widths: [36, 21, 16],
    rows: [
      [e.adjustmentName, e.adjustmentPercent, e.subtotal],
      ...estimate.adjustments.map((row, i) => [
        row.name,
        row.percent,
        formula(
          `IF(ISNUMBER('${names.estimate}'!B6),ROUND('${names.estimate}'!B6*B${i + 2}/100,${precision}),"")`,
          row.amount,
        ),
      ]),
    ],
  };
  const range = (sheet: Sheet, col: string) =>
    `'${sheet.name}'!${col}2:${col}${Math.max(2, sheet.rows.length)}`;
  const phaseCosts = range(phases, 'P');
  const phaseHours = range(phases, 'N');
  const extraCosts = range(extras, 'G');
  const extraHours = range(extras, 'E');
  const r = estimate.result;
  const results: Sheet = {
    name: names.estimate,
    widths: [40, 25, 22],
    rows: [
      [c.exportNote],
      [e.currency, estimate.currency],
      [c.calculation, 'restoration-v1'],
      [e.assumptions, estimate.assumptions],
      [e.taxPercent, estimate.tax],
      [
        e.subtotal,
        formula(
          `IF(COUNT(${phaseCosts})<${estimate.phases.length},"",ROUND(SUM(${phaseCosts},${extraCosts}),${precision}))`,
          r.subtotal,
        ),
      ],
      [
        e.beforeTax,
        formula(
          `IF(ISNUMBER(B6),ROUND(B6+SUM(${range(adjustments, 'C')}),${precision}),"")`,
          r.beforeTax,
        ),
      ],
      [e.taxTotal, formula(`IF(ISNUMBER(B7),ROUND(B7*B5/100,${precision}),"")`, r.tax)],
      [c.estimateTotal, formula(`IF(ISNUMBER(B7),ROUND(B7+B8,${precision}),"")`, r.total)],
      [
        e.hours,
        formula(
          `IF(COUNT(${phaseHours})<${estimate.phases.length},"",SUM(${phaseHours},${extraHours}))`,
          r.hours,
        ),
      ],
      [e.projectExtra, formula(`SUMIF(${range(extras, 'A')},0,${extraCosts})`, r.extras)],
      [],
      [object, e.subtotal, object + ' #'],
      ...estimate.objects.map((name, i) => {
        const row = i + 14;
        const objectPhases = range(phases, 'A');
        const subtotal = `IF(COUNTIFS(${objectPhases},C${row},${phaseCosts},"")>0,"",ROUND(SUMIF(${objectPhases},C${row},${phaseCosts})+SUMIF(${range(extras, 'A')},C${row},${extraCosts}),${precision}))`;
        return [name, formula(subtotal, r.objects[i]!), i + 1];
      }),
    ],
  };
  return [results, phases, extras, adjustments];
}
