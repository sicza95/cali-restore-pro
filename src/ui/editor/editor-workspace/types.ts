import type { SaveState } from '../../controls/save-status/types';

export interface EditorWorkspaceProps {
  saveState?: SaveState;
  initialFocus?: boolean;
  initialEmpty?: boolean;
}
