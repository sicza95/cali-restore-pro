import type { BrowserItemStatus } from '../../../../platform/projects/browser-contracts';
import type { IconName } from '../../../icon/types';

export const supplements: Partial<Record<BrowserItemStatus, IconName>> = {
  paused: 'circle-x',
  synced: 'circle-check',
  pending: 'sync',
  conflict: 'alert',
  error: 'circle-x',
  unknown: 'help',
};
