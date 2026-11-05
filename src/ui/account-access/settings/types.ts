import type { createAccountAccess } from '../createAccountAccess';
import type { settingsCopy } from './constants';
export type SettingsModel = ReturnType<typeof createAccountAccess>;
export type SettingsProps = { model: SettingsModel };
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
export type Operations = {
  mail: Record<'pending' | 'sent' | 'failed', number>;
  jobs: { id: string; status: keyof Operations['mail']; attempts: number; at: string }[];
  audit: { actorId: string; subjectId: string; action: SettingsKey; at: string }[];
};
