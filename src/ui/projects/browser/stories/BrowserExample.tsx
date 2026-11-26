import { createMemo, createSignal, Show, untrack } from 'solid-js';
import type { Language } from '../../../../platform/i18n/language';
import type { BrowserItemKind } from '../../../../platform/projects/browser-contracts';
import { Icon } from '../../../icon/Icon';
import {
  BrowserEmptyState,
  BrowserGrid,
  BrowserLayout,
  BrowserList,
  BrowserToolbar,
  DeleteDialog,
  InspectorPanel,
  NewNameDialog,
  RenameDialog,
  StatusBadge,
} from '../index';
import type { BrowserSort, BrowserToolbarHandle, BrowserView } from '../types';
import { browserCopy } from '../browser-copy';
import { ItemPreview } from '../item-preview/ItemPreview';
import { sampleItems, samplePreviews, sortSampleItems } from './fixtures';
import { storyCopy } from './story-copy';
import './styles.css';

export type BrowserExampleProps = {
  level?: BrowserItemKind;
  language?: Language;
  initialView?: BrowserView;
  inspectorOpen?: boolean;
  state?: 'empty' | 'no-matches' | 'remote-unavailable' | 'diagnostic';
  initialDialog?: 'new' | 'rename' | 'delete';
  blockedDelete?: boolean;
};

export function BrowserExample(props: BrowserExampleProps) {
  const language = () => props.language ?? 'en';
  const copy = () => browserCopy[language()];
  const text = () => storyCopy[language()];
  const initial = untrack(() => ({ ...props }));
  const [level, setLevel] = createSignal(initial.level ?? 'project');
  const [items, setItems] = createSignal(
    untrack(() => (initial.state === 'empty' ? [] : sampleItems(level(), language()))),
  );
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [view, setView] = createSignal<BrowserView>(initial.initialView ?? 'grid');
  const [sort, setSort] = createSignal<BrowserSort>({ field: 'name', direction: 'asc' });
  const [query, setQuery] = createSignal(
    initial.state === 'diagnostic'
      ? 'owner:"anna'
      : initial.state === 'no-matches'
        ? 'not present'
        : '',
  );
  const [findOpen, setFindOpen] = createSignal(
    !!initial.state && ['diagnostic', 'no-matches'].includes(initial.state),
  );
  const [inspectorOpen, setInspectorOpen] = createSignal(initial.inspectorOpen ?? true);
  const [dialog, setDialog] = createSignal(initial.initialDialog);
  const [announcement, setAnnouncement] = createSignal('');
  let toolbar: BrowserToolbarHandle | undefined;
  const previews = createMemo(() => samplePreviews(items()));
  const visible = createMemo(() => {
    const filtered =
      props.state === 'diagnostic' && query().includes('"')
        ? [...items()]
        : items().filter((item) =>
            item.name.toLocaleLowerCase(language()).includes(query().toLocaleLowerCase(language())),
          );
    return sortSampleItems(filtered, sort(), language());
  });
  const selected = createMemo(() => items().find((item) => item.id === selectedId()));
  const disabled = () =>
    !selected()
      ? copy().selectItem
      : selected()?.access === 'directory'
        ? copy().askOwner
        : selected()?.access === 'read-only'
          ? copy().readOnly
          : undefined;
  const changeLevel = (next: BrowserItemKind) => {
    setLevel(next);
    setQuery('');
    setItems(sampleItems(next, language()));
    setSelectedId(null);
  };
  const open = (id: string) => {
    if (level() === 'project') changeLevel('object');
    else if (level() === 'object') changeLevel('surface');
    else setAnnouncement(text().opened(items().find((item) => item.id === id)?.name ?? ''));
  };
  const parent = () => {
    if (level() === 'surface') changeLevel('object');
    else if (level() === 'object') changeLevel('project');
  };
  const collectionProps = {
    get language() {
      return language();
    },
    get items() {
      return visible();
    },
    get selectedId() {
      return selectedId();
    },
    get previews() {
      return previews();
    },
    get modifiedLabels() {
      return Object.fromEntries(
        items().map((item) => [
          item.id,
          item.updatedAt === null
            ? copy().unknown
            : new Intl.DateTimeFormat(language(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
                item.updatedAt,
              ),
        ]),
      );
    },
    get renameDisabledReason() {
      return disabled();
    },
    get deleteDisabledReason() {
      return disabled();
    },
    onSelect: setSelectedId,
    onOpen: open,
    onRename: () => setDialog('rename'),
    onDelete: () => setDialog('delete'),
    onParent: parent,
    onFind: () => toolbar?.focusFind(),
  };
  const saveName = (name: string) => {
    if (dialog() === 'new') {
      const next = {
        ...sampleItems(level(), language())[0],
        id: `new-${items().length}`,
        name,
        childCount: 0,
        status: 'local' as const,
      };
      setItems([...items(), next]);
      setSelectedId(next.id);
      setAnnouncement(text().created);
    } else {
      setItems(items().map((item) => (item.id === selectedId() ? { ...item, name } : item)));
      setAnnouncement(text().saved);
    }
    setDialog(undefined);
  };
  return (
    <div class="browser-example">
      <nav class="browser-example-rail" aria-label="CaliRestore Pro">
        <Icon name="brand" size={24} />
        <span>CaliRestore Pro</span>
        <Icon name="folder" />
      </nav>
      <div class="browser-example-main">
        <div class="browser-example-context">
          <span>{text().studio}</span>
          <Show when={level() !== 'project'}>
            <button type="button" onClick={parent}>
              {text().parent}
            </button>
          </Show>
        </div>
        <BrowserLayout
          language={language()}
          title={copy().levels[level()]}
          inspectorOpen={inspectorOpen()}
          announcement={announcement()}
          onFind={() => toolbar?.focusFind()}
          onParent={parent}
          toolbar={
            <BrowserToolbar
              language={language()}
              level={level()}
              view={view()}
              sort={sort()}
              query={query()}
              findOpen={findOpen()}
              inspectorOpen={inspectorOpen()}
              ref={(handle) => (toolbar = handle)}
              renameDisabledReason={disabled()}
              deleteDisabledReason={disabled()}
              diagnostics={
                props.state === 'diagnostic'
                  ? [{ message: text().diagnostic, position: 6 }]
                  : undefined
              }
              onNew={() => setDialog('new')}
              onRename={() => setDialog('rename')}
              onDelete={() => setDialog('delete')}
              onViewChange={setView}
              onSortChange={setSort}
              onQueryChange={setQuery}
              onFindOpenChange={setFindOpen}
              onSettings={() =>
                setAnnouncement(level() === 'project' ? text().accountSettings : text().settings)
              }
              onImport={() => setAnnouncement(text().imported)}
              onInspectorToggle={() => setInspectorOpen(!inspectorOpen())}
            />
          }
          inspector={
            <Show when={selected()}>
              {(item) => (
                <InspectorPanel
                  language={language()}
                  title={item().name}
                  onClose={() => setInspectorOpen(false)}
                  preview={
                    <ItemPreview
                      language={language()}
                      kind={item().kind}
                      preview={previews()[item().id]}
                      directory={item().access === 'directory'}
                    />
                  }
                  details={
                    <dl class="browser-example-details">
                      <dt>{copy().name}</dt>
                      <dd>{item().name}</dd>
                      <dt>{text().owner}</dt>
                      <dd>
                        {item()
                          .owners.map((owner) => owner.name)
                          .join(', ')}
                      </dd>
                      <dt>{copy().created}</dt>
                      <dd>
                        {item().createdAt === null
                          ? copy().unknown
                          : new Intl.DateTimeFormat(language(), {
                              dateStyle: 'medium',
                              timeZone: 'UTC',
                            }).format(item().createdAt!)}
                      </dd>
                    </dl>
                  }
                  storage={
                    <StatusBadge
                      language={language()}
                      status={item().access === 'directory' ? 'remote' : item().status}
                      originals={item().access === 'directory' ? undefined : item().originals}
                    />
                  }
                  restorationDefaults={
                    <Show when={item().access !== 'directory'}>
                      <p>{text().defaults}</p>
                    </Show>
                  }
                  reportBranding={
                    <Show when={item().access !== 'directory'}>
                      <p>{text().branding}</p>
                    </Show>
                  }
                  access={<p>{item().access === 'directory' ? text().directory : text().access}</p>}
                />
              )}
            </Show>
          }
        >
          <Show when={props.state === 'remote-unavailable'}>
            <BrowserEmptyState
              language={language()}
              level={level()}
              state="remote-unavailable"
              onNew={() => setDialog('new')}
              onClear={() => setQuery('')}
              onRetry={() => setAnnouncement(text().retry)}
            />
          </Show>
          <Show
            when={visible().length}
            fallback={
              <BrowserEmptyState
                language={language()}
                level={level()}
                state={query() ? 'no-matches' : 'empty'}
                onNew={() => setDialog('new')}
                onClear={() => setQuery('')}
                onRetry={() => setAnnouncement(text().retry)}
              />
            }
          >
            <Show when={view() === 'grid'} fallback={<BrowserList {...collectionProps} />}>
              <BrowserGrid {...collectionProps} />
            </Show>
          </Show>
        </BrowserLayout>
      </div>
      <Show when={dialog() === 'new'}>
        <NewNameDialog
          language={language()}
          level={level()}
          onConfirm={saveName}
          onClose={() => setDialog(undefined)}
        />
      </Show>
      <Show when={dialog() === 'rename' && selected()}>
        <RenameDialog
          language={language()}
          level={level()}
          initialName={selected()?.name}
          onConfirm={saveName}
          onClose={() => setDialog(undefined)}
        />
      </Show>
      <Show when={dialog() === 'delete' && selected()}>
        <DeleteDialog
          language={language()}
          item={selected()!}
          descendants={{
            objects: level() === 'project' ? 4 : 0,
            surfaces: level() === 'surface' ? 0 : 12,
          }}
          blockedReason={props.blockedDelete ? text().blocked : undefined}
          onConfirm={() => {
            setItems(items().filter((item) => item.id !== selectedId()));
            setDialog(undefined);
            setAnnouncement(text().deleted);
          }}
          onClose={() => setDialog(undefined)}
        />
      </Show>
    </div>
  );
}
