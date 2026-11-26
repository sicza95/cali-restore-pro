import type { Account } from '../../account-access/types';
import type { SavedProject } from '../../../platform/projects/types';

export type ProjectAccessSectionProps = {
  project: SavedProject;
  hosted: boolean;
  account: Account | undefined;
  canManage: boolean;
  onOpenProject?: () => void;
};

export type ProjectWideAccessNoteProps = {
  project: Pick<SavedProject, 'id' | 'name'>;
  hosted: boolean;
  onOpenProject?: () => void;
};
