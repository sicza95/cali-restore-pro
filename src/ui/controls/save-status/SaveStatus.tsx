import { Show } from 'solid-js';
import { Icon } from '../../icon/Icon';
import { Button } from '../button/Button';
import { saveIcons, saveLabels } from './constants';
import type { SaveStatusProps } from './types';

export function SaveStatus(props: SaveStatusProps) {
  const text = () => (props.labels ?? saveLabels)[props.state];
  return (
    <div
      class="cr-save"
      data-state={props.state}
      role="status"
      aria-atomic="true"
      title={props.detail}
    >
      <Icon name={saveIcons[props.state]} size={16} />
      <span class="cr-save-long">{text().label}</span>
      <span class="cr-save-short">{text().compact}</span>
      <Show when={props.state === 'error' && props.onRetry}>
        <Button variant="ghost" onClick={() => props.onRetry?.()}>
          {props.retryLabel ?? 'Retry'}
        </Button>
      </Show>
    </div>
  );
}
