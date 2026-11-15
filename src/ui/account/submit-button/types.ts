import type { Message, Translate } from '../../account-access/types';

export type SubmitButtonProps = {
  t: Translate;
  busy: boolean;
  label?: Message;
  controlId?: string;
};
