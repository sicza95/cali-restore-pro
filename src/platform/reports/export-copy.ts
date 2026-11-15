import { defineCopy } from '../i18n/define';

/** Sheet names and column headings in exported workbooks. They follow the draft's language. */
export const exportCopy = defineCopy({
  en: {
    reportSheet: 'Report',
    estimateSheet: 'Estimate',
    adjustmentsSheet: 'Adjustments',
    object: 'Object',
    phase: 'Phase',
    baselineProductivity: 'Baseline productivity',
  },
  hu: {
    reportSheet: 'Jelentés',
    estimateSheet: 'Becslés',
    adjustmentsSheet: 'Korrekciók',
    object: 'Tárgy',
    phase: 'Munkafázis',
    baselineProductivity: 'Alap termelékenység',
  },
});
