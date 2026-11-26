import type { JSX } from 'solid-js';
import { icons } from './constants';
import type { IconProps } from './types';
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import './styles.css';

/** Locally bundled Font Awesome glyphs, with labels supplied by the owning control. */
export function Icon(props: IconProps): JSX.Element {
  return (
    <span
      class={`cr-icon fa-solid fa-${icons[props.name]} ${props.class ?? ''}`}
      style={{
        'font-size': `${props.size ?? 20}px`,
        width: `${props.size ?? 20}px`,
        height: `${props.size ?? 20}px`,
      }}
      aria-hidden="true"
    />
  );
}
