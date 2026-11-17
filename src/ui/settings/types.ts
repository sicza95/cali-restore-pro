import type { settingsCopy } from './settings-copy';
import type { AdminOperations } from '../../platform/api';
export type SettingsKey = keyof typeof settingsCopy.en;
export type Role = 'member' | 'administrator' | 'superuser';
export type State = 'active' | 'suspended' | 'pending_verification' | 'pending_deletion';
export type AdminAccount = {
  id: string;
  email: string;
  role: Role;
  state: State;
  permissions: number;
  serverFeatures: boolean;
  quotaMiB: number;
  sessions: number;
};
export type AccountPage = { accounts: AdminAccount[]; next: string };
export type Operations = Omit<AdminOperations, 'audit'> & {
  audit: (Omit<AdminOperations['audit'][number], 'action'> & { action: SettingsKey })[];
};
