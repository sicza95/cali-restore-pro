import type { DeletionStatus } from '../../platform/api/types.gen';
import type { accountCopy as copy } from './copy';

export type { Language } from '../../platform/i18n/language';
export type Message = keyof typeof copy.en;
export type Translate = (key: Message) => string;
export type Session = { id: string; createdAt: string; current: boolean };
export type Account = { id: string; email: string; state: string; role: string };
export type Submit = (event: SubmitEvent, action: string, success: Message) => void;
export type AuthResponse = Partial<DeletionStatus> & {
  error?: string;
  csrfToken?: string;
  account?: Account;
  sessions?: Session[];
  capabilities?: string[];
  confirmedUntil?: string | null;
};

export type TranslatedFieldProps = { t: Translate };
