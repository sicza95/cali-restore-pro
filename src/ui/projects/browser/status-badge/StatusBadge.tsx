import { Show } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import { CompositeIcon } from '../../../composite-icon/CompositeIcon';
import { supplements } from './constants';
import { browserCopy } from '../browser-copy';
import type { StatusBadgeProps } from '../types';
import '../styles.css';
import './styles.css';

/** Intentionally silent on refresh. Selection and command announcements belong to the browser. */
export function StatusBadge(props: StatusBadgeProps) {
  const copy = () => browserCopy[props.language];
  return (
    <span class="browser-status-group">
      <span class="browser-status" data-status={props.status} title={copy().statuses[props.status]}>
        <Show
          when={supplements[props.status]}
          fallback={<Icon name={props.status === 'local' ? 'devices' : 'cloud'} size={20} />}
        >
          {(supplement) => <CompositeIcon base="cloud" supplement={supplement()} size={20} />}
        </Show>
        <span class="browser-status-text">{copy().statuses[props.status]}</span>
      </span>
      <Show when={props.originals !== 'empty' && props.originals}>
        {(availability) => (
          <span class="browser-originals" title={copy().originals[availability()]}>
            <Icon
              name={
                availability() === 'all'
                  ? 'check'
                  : availability() === 'unknown'
                    ? 'help'
                    : 'offline'
              }
              size={16}
            />
            <span class="browser-sr-only">{copy().originals[availability()]}</span>
          </span>
        )}
      </Show>
    </span>
  );
}
