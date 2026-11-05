import { For } from 'solid-js';
import { Icon } from '../../icon/Icon';
import { tools } from './constants';
import { moveFocus } from '../../shared/moveFocus';
import type { ToolRailProps } from './types';

export function ToolRail(props: ToolRailProps) {
  return (
    <div
      class="cr-tool-rail cr-glass"
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      onKeyDown={(event) => moveFocus(event, event.currentTarget, 'button')}
    >
      <For each={tools}>
        {(tool) => (
          <button
            class="cr-tool"
            type="button"
            aria-label={tool.label}
            aria-pressed={props.active === tool.id}
            aria-keyshortcuts={tool.shortcut}
            title={`${tool.label} (${tool.shortcut})`}
            tabIndex={props.active === tool.id ? 0 : -1}
            onClick={() => props.onChange(tool.id)}
          >
            <Icon name={tool.icon} size={22} />
          </button>
        )}
      </For>
    </div>
  );
}
