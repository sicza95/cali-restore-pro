import type { IconName } from '../../icon/types';
import type { SaveLabels, SaveState } from './types';

export const saveIcons: Record<SaveState, IconName> = {
  saved: 'check',
  saving: 'more',
  offline: 'offline',
  draft: 'check',
  error: 'alert',
};

/** English defaults; hosts pass their language's labels through `labels`. */
export const saveLabels: SaveLabels = {
  saved: { label: 'Saved on this device', compact: 'Saved' },
  saving: { label: 'Saving on this device…', compact: 'Saving…' },
  offline: { label: 'Offline · saved on this device', compact: 'Offline · saved' },
  draft: { label: 'Draft saved on this device', compact: 'Draft saved' },
  error: { label: 'Could not save', compact: 'Could not save' },
};
