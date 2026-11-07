import { control } from './constants';
import { clamp } from './geometry';

export function DrawNumber(props: {
  name: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onValue: (value: number) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        data-control-id={control(props.name)}
        type="number"
        min={props.min ?? 0}
        max={props.max ?? 100}
        step="0.1"
        value={props.value}
        onChange={(event) => {
          const input = event.currentTarget;
          const value = Number.isFinite(input.valueAsNumber)
            ? clamp(input.valueAsNumber, props.min, props.max)
            : props.value;
          props.onValue(value);
          input.value = String(value);
        }}
      />
    </label>
  );
}

export function DrawToggle(props: {
  name: string;
  label: string;
  checked: boolean;
  onValue: (value: boolean) => void;
}) {
  return (
    <label class="drawing-toggle">
      <input
        data-control-id={control(props.name)}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onValue(event.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}
