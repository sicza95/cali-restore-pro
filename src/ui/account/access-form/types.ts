import type { PublicRouteName } from '../../router/types';
import type { Accessor } from 'solid-js';
import type { Language, Submit, Translate } from '../../account-access/types';

export type AccessFormProps = {
  view: 'login' | PublicRouteName;
  language: Language;
  linkToken: string;
  submit: Submit;
  t: Translate;
  busy: Accessor<boolean>;
  /** Discoverable passkey sign-in; the button is shown only where browsers allow passkeys. */
  passkeySignIn?: () => void;
};
