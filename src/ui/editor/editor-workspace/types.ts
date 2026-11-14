import type { JSX } from 'solid-js';
import type { SaveState } from '../../controls/save-status/types';
import type { Tool } from '../../controls/tool-rail/types';
import type { EditorCopy, EditorLayer, LayerId } from '../types';

export type EditorHistory = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/** The shell holds no state: every value comes in as a prop and every change goes out as a call. */
export interface EditorWorkspaceProps {
  /** Root element. Use a non-landmark when the page already has a `main`. */
  as?: 'main' | 'section' | 'div';
  title: string;
  breadcrumb: readonly string[];
  layers: readonly EditorLayer[];
  activeLayer: LayerId;
  onSelectLayer: (layer: LayerId) => void;
  onToggleLayer: (layer: LayerId) => void;
  tool: Tool;
  onTool: (tool: Tool) => void;
  history: EditorHistory;
  saveState: SaveState;
  copy?: Partial<EditorCopy>;
  /** No surface yet: hides the tools and shows the inspector's empty state. */
  empty?: boolean;
  focus: boolean;
  onFocus: (focus: boolean) => void;
  /** Mask opacity in percent. */
  maskOpacity: number;
  onMaskOpacity: (opacity: number) => void;
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

export type ToolContextProps = { tool: Tool; layer?: string; children?: JSX.Element };
