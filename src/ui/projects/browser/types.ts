import type { JSX } from 'solid-js';
import type { Language } from '../../../platform/i18n/language';
import type {
  BrowserItemDescriptor,
  BrowserItemKind,
  BrowserItemStatus,
  BrowserOriginalAvailability,
} from '../../../platform/projects/browser-contracts';

export type BrowserView = 'grid' | 'list';
export type BrowserSort = { field: 'name' | 'created' | 'modified'; direction: 'asc' | 'desc' };
/** Resolved thumbnail URLs are owned and revoked by the caller, never by these components. */
export type BrowserPreview = { cover?: string; images?: readonly string[] };
export type BrowserDiagnostic = { message: string; position?: number };
export type BrowserToolbarHandle = { focusFind: () => void };
export type BrowserToolbarProps = {
  language: Language;
  level: BrowserItemKind;
  view: BrowserView;
  sort: BrowserSort;
  query: string;
  diagnostics?: readonly BrowserDiagnostic[];
  findOpen: boolean;
  inspectorOpen: boolean;
  newDisabledReason?: string;
  renameDisabledReason?: string;
  deleteDisabledReason?: string;
  settingsDisabledReason?: string;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
  onViewChange: (view: BrowserView) => void;
  onSortChange: (sort: BrowserSort) => void;
  onQueryChange: (query: string) => void;
  onFindOpenChange: (open: boolean) => void;
  onSettings: () => void;
  onInspectorToggle: () => void;
  /** Root only. Omit when backup import is unavailable. */
  onImport?: () => void;
  ref?: (handle: BrowserToolbarHandle) => void;
};
export type BrowserCollectionProps = {
  language: Language;
  items: readonly BrowserItemDescriptor[];
  selectedId: string | null;
  previews?: Readonly<Record<string, BrowserPreview>>;
  /** Optional locale-formatted dates, allowing the caller to choose a timezone. */
  modifiedLabels?: Readonly<Record<string, string>>;
  renameDisabledReason?: string;
  deleteDisabledReason?: string;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onParent?: () => void;
  onFind: () => void;
};
export type ItemProps = {
  language: Language;
  item: BrowserItemDescriptor;
  preview?: BrowserPreview;
  modifiedLabel?: string;
  selected: boolean;
  tabIndex: 0 | -1;
  onSelect: () => void;
  onOpen: () => void;
};
export type StatusBadgeProps = {
  language: Language;
  status: BrowserItemStatus;
  originals?: BrowserOriginalAvailability;
};
export type BrowserLayoutProps = {
  language: Language;
  title: string;
  toolbar: JSX.Element;
  inspectorOpen: boolean;
  inspector?: JSX.Element;
  children: JSX.Element;
  /** Caller supplies mutation announcements; frequent status refreshes stay silent. */
  announcement?: string;
  onFind?: () => void;
  onParent?: () => void;
};
/** Solid's JSX.Element is the slot type (this repository does not use React). */
export type InspectorPanelProps = {
  language: Language;
  title: string;
  onClose: () => void;
  preview?: JSX.Element;
  cover?: JSX.Element;
  coverTitle?: string;
  details?: JSX.Element;
  storage?: JSX.Element;
  restorationDefaults?: JSX.Element;
  reportBranding?: JSX.Element;
  access?: JSX.Element;
};
export type BrowserEmptyStateProps = {
  language: Language;
  level: BrowserItemKind;
  state: 'empty' | 'no-matches' | 'remote-unavailable';
  disabledReason?: string;
  onNew: () => void;
  onClear: () => void;
  onRetry: () => void;
};
export type NameDialogProps = {
  language: Language;
  level: BrowserItemKind;
  initialName?: string;
  busy?: boolean;
  error?: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
};
export type DeleteDialogProps = {
  language: Language;
  item: BrowserItemDescriptor;
  /** All descendants, not just the immediate-child count. Null means unknown. */
  descendants: { objects: number | null; surfaces: number | null };
  blockedReason?: string;
  /** A project that was never hosted has no trash: deleting it removes it for good. */
  permanent?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
};
