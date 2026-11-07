import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import type { FixtureId } from '../../editor/checkpoint-review/fixtures';
import type { EstimateUnit } from './estimate-model';

export type Version = 'current' | FixtureId;
export type Selection = {
  included: boolean;
  version: Version;
  compare: Version | '';
  references: string[];
};
export const defaultSelection: Selection = {
  included: true,
  version: 'current',
  compare: '',
  references: [],
};
export const versions = ['current', 'baseline', 'followup'] as const satisfies readonly Version[];
export const contentKeys = ['map', 'legend', 'table', 'detail'] as const;
export const formats = ['PDF', 'SVG', 'PNG', 'CSV', 'XLSX'] as const;
export type Format = (typeof formats)[number];
export type Branding = {
  studio: string;
  contact: string;
  footer: string;
  accent: string;
  logo: string;
};
export type PreviewSurface = {
  id: string;
  name: string;
  object: string;
  version: Version;
  compare: Selection['compare'];
  unit: EstimateUnit;
  references: number[];
};
export type Draft = {
  project: Pick<SavedProject, 'name' | 'revision' | 'updatedAt'>;
  surfaces: PreviewSurface[];
  language: Language;
  content: Record<(typeof contentKeys)[number], boolean>;
  notes: string;
  finances: 'none' | 'summary' | 'full';
  branding?: Branding;
  format: Format;
  resolution: string;
  workbook: 'snapshot' | 'editable';
};
