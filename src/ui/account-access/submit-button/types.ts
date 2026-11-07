import type { Message, Translate } from '../types';

export type SubmitButtonProps = {
  t: Translate;
  busy: boolean;
  label?: Message;
  controlId?: string;
};
