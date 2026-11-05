import type { JSX } from 'solid-js';

export type FieldProps = {
  label: string;
  value: string;
  onInput: (value: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
  inputMode?: JSX.InputHTMLAttributes<HTMLInputElement>['inputMode'];
};
