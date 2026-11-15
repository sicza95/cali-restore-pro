import type { JSX } from 'solid-js';
import type { SaveState } from '../../controls/save-status/types';
import type { Tool, ToolItem } from '../../controls/tool-rail/types';
import type { IconName } from '../../icon/types';
import type { LayerControl } from '../layer-panel/types';
import type { EditorCopy, EditorLayer, LayerId } from '../types';

export type EditorHistory = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * The shell holds no state: every value comes in as a prop and every change goes out as a call.
 * `T` is the tool id. Without `tools` the rail shows the review constant, so `T` must stay `Tool`.
 */
export interface EditorWorkspaceProps<T extends string = Tool> {
  /** Root element. Use a non-landmark when the page already has a `main`. */
  as?: 'main' | 'section' | 'div';
  title: string;
  breadcrumb: readonly string[];
  layers: readonly EditorLayer[];
  activeLayer: LayerId;
  onSelectLayer: (layer: LayerId) => void;
  onToggleLayer: (layer: LayerId) => void;
  /** Passed to `LayerPanel`: one tree in layer order, row control ids and host-owned folders. */
  layerTree?: boolean;
  layerControlId?: (kind: LayerControl) => string;
  onToggleLayerExpand?: (folder: LayerId) => void;
  tool: T;
  onTool: (tool: T) => void;
  /** The rail's tools; defaults to the review constant. */
  tools?: readonly ToolItem<T>[];
  /** Accessible name of the tool rail. */
  toolsLabel?: string;
  /** Why a tool cannot be selected now; a non-empty reason disables it. */
  toolReason?: (tool: T) => string | undefined;
  /** Each tool's `data-control-id`. */
  toolControlId?: (tool: T) => string;
  history: EditorHistory;
  saveState: SaveState;
  copy?: Partial<EditorCopy>;
  /** No surface yet: hides the tools and shows the inspector's empty state. */
  empty?: boolean;
  focus: boolean;
  onFocus: (focus: boolean) => void;
  /** Mask opacity in percent. */
  maskOpacity: number;
  /** Without it the footer has no mask opacity control. */
  onMaskOpacity?: (opacity: number) => void;
  zoom?: { value: string; label: string };
  onCalibrate?: () => void;
  onExport?: () => void;
  canvas: JSX.Element;
  toolOptions?: JSX.Element;
  inspectorDetail?: JSX.Element;
  footerStart?: JSX.Element;
  /** Notices and dialogs, rendered last inside the root. */
  children?: JSX.Element;
}

export type ToolContextProps = { icon: IconName; layer?: string; children?: JSX.Element };
