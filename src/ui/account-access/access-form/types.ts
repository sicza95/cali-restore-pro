import type { Accessor } from 'solid-js';
import type { Route, Submit, Translate } from '../types';

export type AccessFormProps = {
  view: Route;
  linkToken: string;
  submit: Submit;
  t: Translate;
  busy: Accessor<boolean>;
};
