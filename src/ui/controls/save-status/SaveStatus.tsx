import { Show } from 'solid-js';
import { Icon } from '../../icon/Icon';
import { Button } from '../button/Button';
import { saveStates } from './constants';
import type { SaveStatusProps } from './types';

export function SaveStatus(props: SaveStatusProps) {
  return (
    <div class="cr-save" data-state={props.state} role="status" aria-atomic="true">
      <Icon name={saveStates[props.state].icon} size={16} />
      <span class="cr-save-long">{saveStates[props.state].label}</span>
      <span class="cr-save-short">{saveStates[props.state].compact}</span>
      <Show when={props.state === 'error' && props.onRetry}>
        <Button variant="ghost" onClick={() => props.onRetry?.()}>
          Retry
        </Button>
      </Show>
    </div>
  );
}
