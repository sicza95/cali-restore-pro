import { checkpointControls } from '../editor/checkpoint-review/registry';
import { drawingControls } from '../editor/drawing-review/registry';
import { accountControls } from './account-controls';
import { vaultEntryControls } from './account-security/entry-controls';
import { vaultControls } from './account-security/vault-controls';
import { sharingControls } from './invitations/sharing-controls';
import {
  accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
} from './navigation-controls';
import { estimateControls } from './project-review/estimate-controls';
import { reportControls } from './project-review/report-controls';
import { projectControls } from './projects/project-controls';
import { projectOperationControls } from './projects/project-operation-controls';
import { surfaceControls } from './projects/surface-review-controls';
import { settingsControls } from './settings/settings-controls';

export const applicationControls = [
  ...accountNavigationControls,
  languageControl,
  menuControl,
  signOutControl,
  ...Object.values(vaultEntryControls),
  ...accountControls,
  ...vaultControls,
  ...settingsControls,
  ...projectControls,
  ...projectOperationControls,
  ...sharingControls,
  ...surfaceControls,
  ...drawingControls,
  ...checkpointControls,
  ...estimateControls,
  ...reportControls,
];
