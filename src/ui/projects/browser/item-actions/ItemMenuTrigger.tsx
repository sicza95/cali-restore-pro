import { Show } from 'solid-js';
import type { Language } from '../../../../platform/i18n/language';
import { Icon } from '../../../icon/Icon';
import { itemActionCopy } from './copy';

export function ItemMenuTrigger(props: {
  language: Language;
  onOpen?: (x: number, y: number) => void;
}) {
  return (
    <Show when={props.onOpen}>
      <button
        type="button"
        class="browser-action browser-item-more"
        aria-label={itemActionCopy[props.language].more}
        title={itemActionCopy[props.language].more}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          props.onOpen?.(rect.left, rect.bottom);
        }}
      >
        <Icon name="more-vertical" size={18} />
      </button>
    </Show>
  );
}
