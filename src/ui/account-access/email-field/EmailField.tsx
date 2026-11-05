import type { TranslatedFieldProps } from '../types';

export function EmailField(props: TranslatedFieldProps) {
  return (
    <label>
      {props.t('email')}
      <input name="email" type="email" autocomplete="email" required maxlength={254} />
    </label>
  );
}
