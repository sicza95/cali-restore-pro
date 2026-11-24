import type { TranslatedFieldProps } from '../../account-access/types';

export function EmailField(props: TranslatedFieldProps & { value?: string; autofocus?: boolean }) {
  return (
    <label>
      {props.t('email')}
      <input
        name="email"
        type="email"
        autocomplete="email"
        required
        maxlength={254}
        value={props.value ?? ''}
        autofocus={props.autofocus}
      />
    </label>
  );
}
