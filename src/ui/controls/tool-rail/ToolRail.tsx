import { For, Show } from 'solid-js';
import { Icon } from '../../icon/Icon';
import { toolControlId, tools } from './constants';
import { moveFocus } from '../../shared/moveFocus';
import type { Tool, ToolItem, ToolRailProps } from './types';

export function ToolRail<T extends string = Tool>(props: ToolRailProps<T>) {
  const items = () => (props.tools ?? tools) as readonly ToolItem<T>[];
  const controlId = (tool: T) => (props.controlId ?? toolControlId)(tool);
  const reason = (tool: T) => props.disabledReason?.(tool) || undefined;

  return (
    <div
      class="cr-tool-rail cr-glass"
      role="toolbar"
      aria-label={props.label ?? 'Drawing tools'}
      aria-orientation="vertical"
      onKeyDown={(event) => moveFocus(event, event.currentTarget, 'button')}
    >
      <For each={items()}>
        {(tool) => (
          <button
            class="cr-tool"
            type="button"
            data-control-id={controlId(tool.id)}
            aria-label={tool.label}
            aria-pressed={props.active === tool.id}
            aria-keyshortcuts={tool.shortcut}
            aria-disabled={reason(tool.id) ? true : undefined}
            aria-describedby={reason(tool.id) ? `${controlId(tool.id)}-reason` : undefined}
            title={reason(tool.id) ?? `${tool.label} (${tool.shortcut})`}
            tabIndex={props.active === tool.id ? 0 : -1}
            onClick={() => reason(tool.id) || props.onChange(tool.id)}
          >
            <Icon name={tool.icon} size={22} />
            {/* Inside the button, so the rail's children stay one button per tool. */}
            <Show when={reason(tool.id)}>
              <span class="cr-tool-reason" id={`${controlId(tool.id)}-reason`}>
                {reason(tool.id)}
              </span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
