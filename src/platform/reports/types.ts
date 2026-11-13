import type { AreaUnit } from '../estimates/types';
import type { ReportEstimate } from './estimate';
import type { WorkbookEstimate } from './workbook-estimate';

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

export type PreviewSurface = {
  id: string;
  name: string;
  object: string;
  version: Version;
  compare: Selection['compare'];
  unit: AreaUnit;
  references: number[];
};

export type Draft = Pick<
  ReportSettings,
  'language' | 'content' | 'notes' | 'branding' | 'format'
> & {
  project: { name: string; revision: number; updatedAt: number };
  surfaces: PreviewSurface[];
  estimate?: ReportEstimate;
  estimateState?: 'unavailable' | 'outsideScope';
  resolution?: ReportSettings['resolution'];
  workbook?: ReportSettings['workbook'];
  workbookEstimate?: WorkbookEstimate;
};
