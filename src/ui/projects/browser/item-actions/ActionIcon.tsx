import { Show } from 'solid-js';
import { CompositeIcon } from '../../../composite-icon/CompositeIcon';
import { Icon } from '../../../icon/Icon';
import type { IconName } from '../../../icon/types';

export function ActionIcon(props: {
  icon: IconName;
  supplement?: IconName;
  size?: number;
  class?: string;
}) {
  return (
    <Show
      when={props.supplement}
      fallback={<Icon name={props.icon} size={props.size ?? 18} class={props.class} />}
    >
      {(supplement) => (
        <CompositeIcon
          base={props.icon}
          supplement={supplement()}
          size={props.size ?? 18}
          class={props.class}
        />
      )}
    </Show>
  );
}
