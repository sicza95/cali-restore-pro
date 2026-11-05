import { Show, splitProps } from 'solid-js';
import { Icon } from '../../icon/Icon';
import type { ButtonProps } from './types';

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['variant', 'icon', 'children', 'class']);
  return (
    <button
      type="button"
      {...rest}
      class={`cr-button cr-button--${local.variant ?? 'secondary'} ${local.class ?? ''}`}
    >
      <Show when={local.icon}>{(name) => <Icon name={name()} />}</Show>
      {local.children}
    </button>
  );
}
