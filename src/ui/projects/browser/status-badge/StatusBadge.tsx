import { itemActionCopy } from '../item-actions/copy';
import { Show } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import type { IconName } from '../../../icon/types';
import type { BrowserItemStatus } from '../../../../platform/projects/browser-contracts';
import { browserCopy } from '../browser-copy';
import type { StatusBadgeProps } from '../types';
import '../styles.css';

const icons: Record<BrowserItemStatus, IconName> = {
  local: 'devices',
  paused: 'sync',
  remote: 'cloud',
  synced: 'cloud-check',
  pending: 'sync',
  conflict: 'alert',
  error: 'alert',
  unknown: 'cloud-question',
};

/** Intentionally silent on refresh. Selection and command announcements belong to the browser. */
export function StatusBadge(props: StatusBadgeProps) {
  const copy = () => browserCopy[props.language];
  return (
    <span class="browser-status-group">
      <Show when={props.hosted}>
        <span class="browser-hosted-indicator" title={itemActionCopy[props.language].hosting}>
          <Icon name="cloud" size={16} />
          <span class="browser-sr-only">{itemActionCopy[props.language].hosting}</span>
        </span>
      </Show>
      <span class="browser-status" data-status={props.status} title={copy().statuses[props.status]}>
        <Icon name={icons[props.status]} size={16} />
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
