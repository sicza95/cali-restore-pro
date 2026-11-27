import { ItemContextMenu } from '../browser/item-actions/ItemActions';
import { itemActionCopy } from '../browser/item-actions/copy';
import type { ItemAction, ShowFilter } from '../browser/item-actions/types';
import { createMemo, createSignal, Show, untrack } from 'solid-js';
import type { JSX } from 'solid-js';
import type { Language } from '../../../platform/i18n/language';
import type {
  BrowserItemDescriptor,
  BrowserItemKind,
} from '../../../platform/projects/browser-contracts';
import { filterItems, sortItems } from '../../../platform/projects/browser/browser-model';
import { parseQuery } from '../../../platform/projects/browser/query';
import type { QueryAst } from '../../../platform/projects/browser/query';
import {
  BrowserEmptyState,
  BrowserGrid,
  BrowserLayout,
  BrowserList,
  BrowserToolbar,
  DeleteDialog,
  NewNameDialog,
  useBrowserPreferences,
} from '../browser';
import type { BrowserPreview, BrowserToolbarHandle } from '../browser';
import { browserCopy } from '../browser/browser-copy';
import { pageCopy } from './copy';

/** A failure whose message is already worded for the person, shown in the open dialog. */
export class ShownError extends Error {}

/** Selection per browser scope, so Back returns to the item that was selected. */
const remembered = new Map<string, string | null>();

export type Deletion = {
  descendants: { objects: number | null; surfaces: number | null };
  /** Resolves to a reason when deleting would lose unresolved work. */
  check?: () => Promise<string | undefined>;
  /** A never-hosted project: no trash, deleted for good. */
  permanent?: boolean;
};

export type BrowserPageProps = {
  language: Language;
  /** The kind of the items listed: projects at the root, objects in a project, and so on. */
  level: BrowserItemKind;
  /** Remembers the selection of this listing, e.g. the project ID for its objects. */
  scope: string;
  title: string;
  items: readonly BrowserItemDescriptor[];
  previews: Readonly<Record<string, BrowserPreview>>;
  archived?: (item: BrowserItemDescriptor) => boolean | undefined;
  creatorName?: (id: string) => string | undefined;
  remoteUnavailable?: boolean;
  notice?: JSX.Element;
  announcement?: string;
  newDisabledReason?: string;
  /** Why the selection cannot be renamed or deleted, beyond read-only and directory entries. */
  changeReason?: (item: BrowserItemDescriptor) => string | undefined;
  deleteReason?: (item: BrowserItemDescriptor) => string | undefined;
  settingsDisabledReason?: string;
  onOpen: (item: BrowserItemDescriptor) => void;
  onParent?: () => void;
  onRetry?: () => void;
  onCreate: (name: string) => Promise<string | undefined>;
  onRename: (item: BrowserItemDescriptor, name: string) => Promise<void>;
  deletion: (item: BrowserItemDescriptor) => Deletion;
  onDelete: (item: BrowserItemDescriptor) => Promise<string | undefined>;
  actions?: (item: BrowserItemDescriptor) => readonly ItemAction[];
  online?: (item: BrowserItemDescriptor) => boolean;
  onSettings: () => void;
  onImport?: () => void;
  inspector: (item: () => BrowserItemDescriptor, close: () => void) => JSX.Element;
};

/** The shared browser at one level, fed by real descriptors and durable operations. */
export function BrowserPage(props: BrowserPageProps) {
  const copy = () => browserCopy[props.language];
  const text = () => pageCopy[props.language];
  const level = () => props.level;
  const prefs = useBrowserPreferences(level);
  const scope = untrack(() => props.level + ':' + props.scope);
  const [selectedId, setSelected] = createSignal<string | null>(remembered.get(scope) ?? null);
  const select = (id: string | null) => {
    remembered.set(scope, id);
    setSelected(id);
  };
  const [query, setQuery] = createSignal('');
  const [findOpen, setFindOpen] = createSignal(false);
  const [dialog, setDialog] = createSignal<'new' | 'delete'>();
  const [editingId, setEditingId] = createSignal<string>();
  const [menu, setMenu] = createSignal<{ id: string; x: number; y: number }>();
  const [showFilter, setShowFilter] = createSignal<ShowFilter>({
    archived: false,
    online: true,
    offline: true,
  });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [blocked, setBlocked] = createSignal<string>();
  const [message, setMessage] = createSignal('');
  let toolbar: BrowserToolbarHandle | undefined;
  let lastValid: QueryAst = { terms: [] };
  const parsed = createMemo(() => parseQuery(query()));
  const ast = createMemo(() => (lastValid = parsed().ast ?? lastValid));
  const diagnostics = () =>
    parsed().diagnostics.map((entry) => ({
      message: text().diagnostics[entry.message] ?? text().queryProblem,
      position: entry.start + 1,
    }));
  const visible = createMemo(() => {
    const terms = ast();
    const asksArchived = terms.terms.some(({ field }) => field === 'archived');
    const shown = filterItems(props.items, terms, {
      archived: (item) => props.archived?.(item) ?? item.archived,
      creatorName: props.creatorName,
    }).filter(
      (item) =>
        (asksArchived || showFilter().archived || !(props.archived?.(item) ?? item.archived)) &&
        ((props.online?.(item) ?? item.status !== 'local')
          ? showFilter().online
          : showFilter().offline),
    );
    return sortItems(shown, prefs.sort());
  });
  // A filtered-out item is not selected: no inspector or action applies to an unseen item.
  const selected = createMemo(() => visible().find((item) => item.id === selectedId()));
  const reason = (kind: 'change' | 'delete') => {
    const item = selected();
    if (!item) return copy().selectItem;
    if (item.access === 'directory') return copy().askOwner;
    if (item.access === 'read-only') return copy().readOnly;
    return (
      (kind === 'delete' ? props.deleteReason?.(item) : undefined) ?? props.changeReason?.(item)
    );
  };
  const close = () => {
    setDialog(undefined);
    setError(undefined);
    setBlocked(undefined);
  };
  async function perform(task: () => Promise<string | undefined>) {
    if (busy()) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await task();
      setMessage(outcome ?? '');
      setDialog(undefined);
    } catch (failure) {
      setError(failure instanceof ShownError ? failure.message : text().failed);
    } finally {
      setBusy(false);
    }
  }
  function openDelete() {
    const item = selected();
    if (!item || reason('delete')) return;
    setBlocked(undefined);
    setDialog('delete');
    const check = props.deletion(item).check;
    if (!check) return;
    setBlocked(text().checkingDelete);
    void check().then(
      (found) => setBlocked(found),
      () => setBlocked(text().blockedDelete),
    );
  }
  const beginRename = () => {
    if (!reason('change')) setEditingId(selected()?.id);
  };
  const actions = (item: BrowserItemDescriptor): readonly ItemAction[] => {
    const c = itemActionCopy[props.language];
    const inherited = props.actions?.(item) ?? [];
    return [
      ...inherited.slice(0, 4),
      { id: 'rename', label: c.rename, icon: 'pen', reason: reason('change'), run: beginRename },
      { id: 'delete', label: c.delete, icon: 'trash', reason: reason('delete'), run: openDelete },
      ...inherited.slice(4),
      {
        id: 'info',
        label: c.info,
        icon: 'info',
        checked: prefs.inspectorOpen(),
        run: () => prefs.setInspectorOpen(!prefs.inspectorOpen()),
      },
    ];
  };
  const open = (id: string) => {
    const item = props.items.find((entry) => entry.id === id);
    if (item && item.access !== 'directory') props.onOpen(item);
  };
  const collection = {
    get language() {
      return props.language;
    },
    get items() {
      return visible();
    },
    get selectedId() {
      return selectedId();
    },
    get previews() {
      return props.previews;
    },
    get modifiedLabels() {
      const format = new Intl.DateTimeFormat(props.language, { dateStyle: 'medium' });
      return Object.fromEntries(
        visible().map((item) => [
          item.id,
          item.updatedAt === null ? copy().unknown : format.format(item.updatedAt),
        ]),
      );
    },
    get renameDisabledReason() {
      return reason('change');
    },
    get deleteDisabledReason() {
      return reason('delete');
    },
    onSelect: select,
    onOpen: open,
    get editingId() {
      return editingId();
    },
    onCancelName: () => setEditingId(undefined),
    onSaveName: async (name: string) => {
      const item = props.items.find((item) => item.id === editingId());
      if (!item) return;
      await props.onRename(item, name);
      setMessage(text().renamed(name));
      setEditingId(undefined);
    },
    onContextMenu: (id: string, x: number, y: number) => {
      select(id);
      setMenu({ id, x, y });
    },
    onRename: beginRename,
    onDelete: openDelete,
    get onParent() {
      return props.onParent;
    },
    onFind: () => toolbar?.focusFind(),
  };
  return (
    <>
      <BrowserLayout
        language={props.language}
        title={props.title}
        inspectorOpen={prefs.inspectorOpen()}
        announcement={props.announcement || message()}
        onFind={() => toolbar?.focusFind()}
        onParent={props.onParent}
        toolbar={
          <BrowserToolbar
            language={props.language}
            level={props.level}
            view={prefs.view()}
            sort={prefs.sort()}
            query={query()}
            diagnostics={diagnostics()}
            findOpen={findOpen()}
            inspectorOpen={prefs.inspectorOpen()}
            newDisabledReason={props.newDisabledReason}
            renameDisabledReason={reason('change')}
            deleteDisabledReason={reason('delete')}
            settingsDisabledReason={props.settingsDisabledReason}
            ref={(handle) => (toolbar = handle)}
            onNew={() => setDialog('new')}
            onRename={beginRename}
            itemActions={selected() ? actions(selected()!) : []}
            showFilter={showFilter()}
            onShowFilter={setShowFilter}
            onDelete={openDelete}
            onViewChange={prefs.setView}
            onSortChange={prefs.setSort}
            onQueryChange={setQuery}
            onFindOpenChange={setFindOpen}
            onSettings={props.onSettings}
            onImport={props.onImport}
            onInspectorToggle={() => prefs.setInspectorOpen(!prefs.inspectorOpen())}
          />
        }
        inspector={
          // Keyed by ID, not by descriptor: a save makes new descriptors, and remounting would
          // drop the inspector's in-progress state.
          <Show when={selected()?.id} keyed>
            {props.inspector(
              () => selected()!,
              () => prefs.setInspectorOpen(false),
            )}
          </Show>
        }
      >
        {props.notice}
        <Show when={props.remoteUnavailable}>
          <BrowserEmptyState
            language={props.language}
            level={props.level}
            state="remote-unavailable"
            onNew={() => setDialog('new')}
            onClear={() => setQuery('')}
            onRetry={() => props.onRetry?.()}
          />
        </Show>
        <Show
          when={visible().length}
          fallback={
            <BrowserEmptyState
              language={props.language}
              level={props.level}
              state={query().trim() ? 'no-matches' : 'empty'}
              disabledReason={props.newDisabledReason}
              onNew={() => setDialog('new')}
              onClear={() => setQuery('')}
              onRetry={() => props.onRetry?.()}
            />
          }
        >
          <Show when={prefs.view() === 'grid'} fallback={<BrowserList {...collection} />}>
            <BrowserGrid {...collection} />
          </Show>
        </Show>
      </BrowserLayout>
      <Show when={dialog() === 'new'}>
        <NewNameDialog
          language={props.language}
          level={props.level}
          busy={busy()}
          error={error()}
          onConfirm={(name) =>
            // eslint-disable-next-line solid/reactivity -- runs once, inside the confirm handler
            void perform(async () => {
              const id = await props.onCreate(name);
              if (id) select(id);
              return text().created(name);
            })
          }
          onClose={close}
        />
      </Show>
      <Show when={menu()} keyed>
        {(position) => (
          <ItemContextMenu
            x={position.x}
            y={position.y}
            label={itemActionCopy[props.language].more}
            actions={selected() && selected()!.id === position.id ? actions(selected()!) : []}
            onClose={() => setMenu(undefined)}
          />
        )}
      </Show>
      <Show when={dialog() === 'delete' && selected()} keyed>
        {(item) => (
          <DeleteDialog
            language={props.language}
            item={item}
            preview={props.previews[item.id]}
            descendants={props.deletion(item).descendants}
            permanent={props.deletion(item).permanent}
            blockedReason={blocked()}
            busy={busy()}
            error={error()}
            onConfirm={() =>
              // eslint-disable-next-line solid/reactivity -- runs once, inside the confirm handler
              void perform(async () => (await props.onDelete(item)) ?? text().deleted(item.name))
            }
            onClose={close}
          />
        )}
      </Show>
    </>
  );
}
