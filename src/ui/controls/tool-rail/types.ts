import type { IconName } from '../../icon/types';
import type { tools } from './constants';

export type Tool = (typeof tools)[number]['id'];

export type ToolItem<T extends string = string> = {
  id: T;
  label: string;
  shortcut: string;
  icon: IconName;
};

/** Without `tools` the rail renders the review constant, so `T` must stay `Tool`. */
export type ToolRailProps<T extends string = Tool> = {
  active: T;
  onChange: (tool: T) => void;
  tools?: readonly ToolItem<T>[];
  /** Accessible name of the toolbar. */
  label?: string;
  /** Why a tool cannot be selected now. A non-empty reason disables the tool and is read out. */
  disabledReason?: (tool: T) => string | undefined;
  /** A blocked tool was tapped or clicked, so the host can show its reason visibly (#81). */
  onBlocked?: (tool: T) => void;
  /** The tool's `data-control-id`. The reason text gets the same id with a `-reason` suffix. */
  controlId?: (tool: T) => string;
};
