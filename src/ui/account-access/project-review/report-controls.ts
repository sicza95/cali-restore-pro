import type { ControlContract } from '../../control-registry/types';
import type { ReportCopy } from './report-copy';
import type { EstimateCopy } from './estimate-copy';

const reportKeys = [
  'includeObject',
  'includeSurface',
  'version',
  'compare',
  'language',
  'units',
  'map',
  'legend',
  'table',
  'detail',
  'notes',
  'references',
  'reference',
  'finances',
  'branding',
  'studio',
  'contact',
  'footer',
  'accent',
  'logo',
  'format',
  'resolution',
  'workbook',
  'preview',
  'save',
  'estimateVersion',
  'cancel',
  'download',
  'final',
] as const satisfies readonly (keyof ReportCopy)[];
export const reportControl = (key: (typeof reportKeys)[number]) => 'report.review.' + key;
export const reviewRoutes = [
  'estimates',
  'reports',
  'outputs',
] as const satisfies readonly (keyof EstimateCopy)[];
export type ReviewRoute = (typeof reviewRoutes)[number];
export const routeControl = (key: ReviewRoute) => 'project.review.' + key;

export const reportControls: readonly ControlContract[] = [
  {
    id: 'project.review.parent',
    labelKey: 'name',
    helpKey: 'routeNav',
    command: 'Return to the authorized project detail route',
    permission: 'Authorized account-local project and unlocked vault',
    prerequisite: 'Project review is open',
    valueSource: 'Encrypted project name and opaque UUID',
    behavior: 'functional',
    owner: 'M-08',
    composition: 'Project review breadcrumb',
    unavailable: {
      failure: 'Show generic unavailable state',
      empty: 'Omit without project',
      locked: 'Show vault gate',
    },
  },
  ...reviewRoutes.map((key): ControlContract => ({
    id: routeControl(key),
    labelKey: key,
    helpKey: 'routeNav',
    command: 'Navigate to opaque project ' + key + ' route',
    permission: 'Signed in and authorized account-local project',
    prerequisite: 'Vault unlocked and project active',
    valueSource: 'Project UUID and review route',
    behavior: 'functional',
    owner: 'M-08',
    composition: 'Project detail and project review navigation',
    unavailable: {
      failure: 'Generic unavailable state',
      empty: 'Omit without project',
      locked: 'Show vault gate',
    },
  })),
  ...reportKeys.map((key): ControlContract => ({
    id: reportControl(key),
    labelKey: key,
    helpKey: 'transient',
    command: 'Review report ' + key,
    permission: 'Unlocked account-local project author',
    prerequisite:
      'Selected authorized objects and surfaces; format-specific controls when applicable',
    valueSource:
      'Authorized project hierarchy, account defaults and encrypted report draft and issued estimate selection',
    behavior: key === 'save' ? 'functional' : 'review',
    owner:
      key === 'download' || key === 'format' || key === 'resolution'
        ? 'M-11'
        : key === 'final'
          ? 'M-16'
          : 'M-10',
    composition: 'Report and output review',
    unavailable: {
      failure: 'Show missing or unavailable state',
      empty: 'Require at least one surface for preview',
      locked: 'Clear report draft',
    },
  })),
  {
    id: 'estimate.scope.projection',
    labelKey: 'readOnly',
    helpKey: 'assessmentOnly',
    command: 'Display decrypted rows for the currently opened estimate scope',
    permission:
      'Active invitation and successfully decrypted estimate-summary or estimate-full envelope',
    prerequisite: 'Verified sender fingerprint, matching envelope and unlocked vault',
    valueSource: 'Existing scope-specific encrypted fixture payload',
    behavior: 'review',
    owner: 'M-09',
    composition: 'Invitation inbox · Estimate projection',
    unavailable: {
      failure: 'Use invitation error state',
      empty: 'Omit financial fields for assessment or history scope',
      locked: 'Clear projection',
    },
  },
];
