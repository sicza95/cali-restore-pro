import { Icon } from '../icon/Icon';
import type { CompositeIconProps } from './types';
import './styles.css';

/** Two decorative glyphs that inherit one color and one accessible label from their owner. */
export function CompositeIcon(props: CompositeIconProps) {
  const size = () => props.size ?? 20;
  return (
    <span
      class={`cr-composite-icon ${props.class ?? ''}`}
      style={{ width: `${size()}px`, height: `${size()}px`, 'font-size': `${size()}px` }}
      aria-hidden="true"
    >
      <span class="cr-composite-icon-base">
        <Icon name={props.base} size={size() * 0.72} />
      </span>
      <span class="cr-composite-icon-supplement">
        <Icon name={props.supplement} size={size() * 0.4} />
      </span>
    </span>
  );
}
