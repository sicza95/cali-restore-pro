import { createUniqueId } from 'solid-js';
import type { RangeControlProps } from './types';

export function RangeControl(props: RangeControlProps) {
  const id = createUniqueId();
  return (
    <div class="cr-range">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        aria-valuetext={`${props.value} ${props.unit}`}
        onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)}
      />
      <output for={id}>
        {props.value}
        <span> {props.unit}</span>
      </output>
    </div>
  );
}
