export type SaveState = 'saved' | 'saving' | 'offline' | 'draft' | 'error';

/** The long and compact text for each save state. */
export type SaveLabels = Record<SaveState, { label: string; compact: string }>;

export type SaveStatusProps = {
  state: SaveState;
  onRetry?: () => void;
  detail?: string;
  labels?: SaveLabels;
  retryLabel?: string;
};
