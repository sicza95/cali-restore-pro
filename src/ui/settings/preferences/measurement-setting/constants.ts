export const measurementSystems = ['metric', 'imperial'] as const;
export const areaUnits = ['', 'cm²', 'm²', 'in²', 'ft²'] as const;
export const areaUnitControls = {
  '': 'default',
  'cm²': 'cm2',
  'm²': 'm2',
  'in²': 'in2',
  'ft²': 'ft2',
} as const;
