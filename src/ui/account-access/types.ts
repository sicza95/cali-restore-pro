import type { copy, publicRoutes } from './constants';

export type Language = keyof typeof copy;
export type Message = keyof typeof copy.en;
export type Translate = (key: Message) => string;
export type Session = { id: string; createdAt: string; current: boolean };
export type Account = { id: string; email: string; state: string; role: string };
export type Route =
  | 'login'
  | 'security'
  | 'profile'
  | 'preferences'
  | 'admin'
  | 'projects'
  | 'invitations'
  | (typeof publicRoutes)[number];
export type Submit = (event: SubmitEvent, action: string, success: Message) => void;
export type AuthResponse = {
  error?: string;
  csrfToken?: string;
  account?: Account;
  sessions?: Session[];
  capabilities?: string[];
  recoverUntil?: string;
  backupExpiresAt?: string;
};

export type TranslatedFieldProps = { t: Translate };
