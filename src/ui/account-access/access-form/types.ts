import type { Accessor } from 'solid-js';
import type { Route, Submit, Translate } from '../types';

export type AccessFormProps = {
  view: Exclude<Route, 'profile' | 'preferences' | 'admin' | 'security'>;
  linkToken: string;
  submit: Submit;
  t: Translate;
  busy: Accessor<boolean>;
};
