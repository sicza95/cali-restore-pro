import type { AreaUnit } from '../estimates/types';

export const versions = ['current', 'baseline', 'followup'] as const;
export const contentKeys = ['map', 'legend', 'table', 'detail'] as const;
export const formats = ['PDF', 'SVG', 'PNG', 'CSV', 'XLSX'] as const;
export const resolutions = ['150', '300', '600'] as const;
export const brandingSources = ['omit', 'defaults', 'override'] as const;
export type Version = (typeof versions)[number];
export type Format = (typeof formats)[number];
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

export type Branding = {
  studio: string;
  contact: string;
  footer: string;
  accent: string;
  logo: string;
};
export type ReportSettings = {
  language: 'en' | 'hu';
  unit: AreaUnit | 'inherited';
  excluded: string[];
  surfaces: Record<string, Selection>;
  content: Record<(typeof contentKeys)[number], boolean>;
  notes: string;
  finances: 'none' | 'summary' | 'full';
  estimate: string;
  brandingSource: (typeof brandingSources)[number];
  branding?: Branding;
  format: Format;
  resolution: (typeof resolutions)[number];
  workbook: 'snapshot' | 'editable';
};
export type ReportDraft = {
  schema: 1;
  project: string;
  projectRevision: number;
  savedAt: string;
  settings: ReportSettings;
};
