import type { SaveState } from '../../ui/controls/save-status/types';

export type EditorReviewProps = {
  saveState?: SaveState;
  initialFocus?: boolean;
  initialEmpty?: boolean;
};
