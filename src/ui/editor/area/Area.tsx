import { formatNumber } from '../../../platform/format/number';
import type { AreaProps } from './types';

export function Area(props: AreaProps) {
  return (
    <span class="cr-number">
      {formatNumber(props.value, props.language ?? 'en')} <span class="cr-unit">m²</span>
    </span>
  );
}
