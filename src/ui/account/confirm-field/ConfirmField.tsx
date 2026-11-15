import type { TranslatedFieldProps } from '../../account-access/types';

export function ConfirmField(props: TranslatedFieldProps) {
  return (
    <label class="confirmation">
      <input type="checkbox" name="confirm" required />
      {props.t('confirmation')}
    </label>
  );
}
