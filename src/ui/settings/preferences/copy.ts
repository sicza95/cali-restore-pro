import { defineCopy } from '../../../platform/i18n/define';

export const restorationPreferenceCopy = defineCopy({
  en: {
    measurement: 'Measurement',
    defaultAreaUnit: (unit: string) => `Default (${unit})`,
    measurementUnits: 'Measurement system',
    metric: 'Metric',
    imperial: 'Imperial',
    followSystem: 'By measurement system (m² or ft²)',
  },
  hu: {
    measurement: 'Mérés',
    defaultAreaUnit: (unit: string) => `Alapértelmezett (${unit})`,
    measurementUnits: 'Mértékegységrendszer',
    metric: 'Metrikus',
    imperial: 'Angolszász',
    followSystem: 'Mértékegységrendszer szerint (m² vagy ft²)',
  },
});
