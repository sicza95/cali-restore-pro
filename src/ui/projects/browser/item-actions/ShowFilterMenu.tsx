import { For } from 'solid-js';
import type { Language } from '../../../../platform/i18n/language';
import { Popup } from '../browser-toolbar/Popup';
import { Icon } from '../../../icon/Icon';
import { itemActionCopy } from './copy';
import type { ShowFilter } from './types';

export function ShowFilterMenu(props: {
  language: Language;
  value: ShowFilter;
  onChange: (value: ShowFilter) => void;
}) {
  const c = () => itemActionCopy[props.language];
  return (
    <Popup label={c().show} icon="filter" controlId="browser.show" menu>
      <For each={['archived', 'online', 'offline'] as const}>
        {(key) => (
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={props.value[key]}
            data-control-id={'browser.show.' + key}
            onClick={(event) => {
              event.stopPropagation();
              props.onChange({ ...props.value, [key]: !props.value[key] });
            }}
          >
            <span>{c()[key]}</span>
            <Icon name={props.value[key] ? 'check' : 'minus'} size={16} />
          </button>
        )}
      </For>
    </Popup>
  );
}
