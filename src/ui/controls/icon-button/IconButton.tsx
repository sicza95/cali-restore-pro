import { splitProps } from 'solid-js';
import { Icon } from '../../icon/Icon';
import { Button } from '../button/Button';
import type { IconButtonProps } from './types';

export function IconButton(props: IconButtonProps) {
  const [local, rest] = splitProps(props, ['label', 'icon', 'class']);
  return (
    <Button
      {...rest}
      class={`cr-icon-button ${local.class ?? ''}`}
      aria-label={local.label}
      title={local.label}
    >
      <Icon name={local.icon} />
    </Button>
  );
}
