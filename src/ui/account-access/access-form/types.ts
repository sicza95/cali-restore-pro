import type { publicRoutes } from '../constants';
import type { Accessor } from 'solid-js';
import type { Submit, Translate } from '../types';

export type AccessFormProps = {
  view: 'login' | (typeof publicRoutes)[number];
  linkToken: string;
  submit: Submit;
  t: Translate;
  busy: Accessor<boolean>;
};
