import type { AreaProps } from './types';

export function Area(props: AreaProps) {
  return (
    <span class="cr-number">
      {props.value.toFixed(2)} <span class="cr-unit">m²</span>
    </span>
  );
}
