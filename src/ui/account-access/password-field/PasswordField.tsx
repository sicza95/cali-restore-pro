import type { PasswordFieldProps } from './types';

export function PasswordField(props: PasswordFieldProps) {
  return (
    <label>
      {props.t(props.kind)}
      <input
        name="password"
        type="password"
        autocomplete={props.kind === 'newPassword' ? 'new-password' : 'current-password'}
        required
        minLength={15}
        maxlength={1024}
        aria-describedby={props.kind === 'newPassword' ? 'password-help' : undefined}
      />
    </label>
  );
}
