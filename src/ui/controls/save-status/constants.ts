import type { IconName } from '../../icon/types';
import type { SaveState } from './types';

export const saveStates: Record<SaveState, { label: string; compact: string; icon: IconName }> = {
  saved: { label: 'Saved on this iPad', compact: 'Saved', icon: 'check' },
  saving: { label: 'Saving on this iPad…', compact: 'Saving…', icon: 'more' },
  offline: { label: 'Offline · saved on this iPad', compact: 'Offline · saved', icon: 'offline' },
  draft: { label: 'Draft saved on this iPad', compact: 'Draft saved', icon: 'check' },
  error: { label: 'Could not save · last saved 14:27', compact: 'Could not save', icon: 'alert' },
};
