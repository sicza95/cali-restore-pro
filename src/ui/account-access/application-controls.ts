import { checkpointControls } from '../editor/checkpoint-review/registry';
import { drawingControls } from '../editor/drawing-review/registry';
import { accountControls } from '../account/account-controls';
import { sharingControls } from '../sharing/sharing-controls';
import { recipientReportControls } from '../recipient-reports/recipient-report-controls';
import {
  accountNavigationControls,
  languageControl,
  themeControl,
  menuControl,
  signOutControl,
} from './navigation-controls';
import { estimateControls } from '../estimates/estimate-controls';
import { reportControls } from '../reports/report-controls';
import { projectControls } from '../projects/project-controls';
import { projectOperationControls } from '../projects/project-operation-controls';
import { surfaceControls } from '../projects/surface-review-controls';
import { settingsControls } from '../settings/settings-controls';

export const applicationControls = [
  ...accountNavigationControls,
  languageControl,
  themeControl,
  menuControl,
  signOutControl,
  ...accountControls,
  ...settingsControls,
  ...projectControls,
  ...projectOperationControls,
  ...sharingControls,
  ...recipientReportControls,
  ...surfaceControls,
  ...drawingControls,
  ...checkpointControls,
  ...estimateControls,
  ...reportControls,
];
