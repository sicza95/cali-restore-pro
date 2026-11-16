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
  /** Accessible names that say what will be undone or redone, for example "Undo · Brush stroke". */
  undoLabel?: string;
  redoLabel?: string;
  /** The undo and redo buttons' `data-control-id`. */
  controlId?: (action: 'undo' | 'redo') => string;
};

/**
 * The shell holds no state: every value comes in as a prop and every change goes out as a call.
 * `T` is the tool id. Without `tools` the rail shows the review constant, so `T` must stay `Tool`.
 */
export interface EditorWorkspaceProps<T extends string = Tool> {
  /** Root element. Use a non-landmark when the page already has a `main`. */
  as?: 'main' | 'section' | 'div';
  /**
   * The surface name and its trail, shown with the brand. Leave both out when the host page already
   * carries them: the header then holds only the save status and the workspace actions.
   */
  title?: string;
  breadcrumb?: readonly string[];
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
  /** A blocked tool was tapped; the host shows its reason, for example in `toolOptions` (#81). */
  onBlockedTool?: (tool: T) => void;
  /** Each tool's `data-control-id`. */
  toolControlId?: (tool: T) => string;
  history: EditorHistory;
  saveState: SaveState;
  /** Longer explanation of where work is saved, shown as the save status title. */
  saveDetail?: string;
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
  /** Without it a titled editor shows Export disabled, and an embedded one leaves it out (#81). */
  onExport?: () => void;
  canvas: JSX.Element;
  toolOptions?: JSX.Element;
  inspectorDetail?: JSX.Element;
  /** Rendered in the Layers tab above the layer list. */
  inspectorLead?: JSX.Element;
  /**
   * Portrait only (960 px and below): the inspector's height and a grip button that switches it.
   * Without it the inspector keeps the fixed portrait height.
   */
  inspectorSize?: InspectorSize;
  footerStart?: JSX.Element;
  /** Notices and dialogs, rendered last inside the root. */
  children?: JSX.Element;
}

export type InspectorSize = {
  /** Short shows the tabs and the top of the Layers tab; tall gives the inspector about 60 %. */
  tall: boolean;
  onTall: (tall: boolean) => void;
  /** The grip's accessible name; `aria-expanded` carries the state. */
  label: string;
  controlId?: string;
};

export type ToolContextProps = { icon: IconName; layer?: string; children?: JSX.Element };
