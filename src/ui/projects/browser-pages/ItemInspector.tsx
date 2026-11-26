import { createMemo, createSignal, Show } from 'solid-js';
import type {
  BrowserItemDescriptor,
  EntityOverrides,
  ProjectOverrides,
} from '../../../platform/projects/browser-contracts';
import { imageDeck } from '../../../platform/projects/browser/deck';
import {
  editableEntityOverrides,
  preserveLegacyProjectSettings,
  resolveSettings,
} from '../../../platform/projects/settings';
import type { RestorationObject, Surface } from '../../../platform/projects/types';
import { useApp } from '../../app-context/AppContext';
import { InspectorPanel, StatusBadge } from '../browser';
import type { BrowserPreview } from '../browser';
import { browserCopy } from '../browser/browser-copy';
import { ItemPreview } from '../browser/item-preview/ItemPreview';
import { ProjectAccessSection, ProjectWideAccessNote } from '../access';
import { BrandingOverridesSection, RestorationOverridesSection } from '../overrides';
import { loadAccountSettings } from '../../settings/preferences/utils';
import { CoverControls } from './CoverControls';
import { ItemDetails } from './ItemDetails';
import { chooseImage, importLogo } from './logo';
import { withOverrides } from './overrides';
import { pageCopy } from './copy';
import { entityOf } from './types';
import type { Workspace } from './types';

/**
 * The right panel for one selected item. Editors are keyed by the item, and every change saves
 * at once against the latest saved project, so selecting elsewhere never loses or misplaces work.
 */
export function ItemInspector(props: {
  ws: Workspace;
  item: BrowserItemDescriptor;
  preview?: BrowserPreview;
  onClose: () => void;
}) {
  const app = useApp();
  const copy = () => browserCopy[props.ws.language];
  const c = () => pageCopy[props.ws.language];
  const target = () =>
    props.item.kind === 'project'
      ? ({ kind: 'project' } as const)
      : props.item.kind === 'object'
        ? ({ kind: 'object', objectId: props.item.id } as const)
        : ({ kind: 'surface', objectId: props.item.objectId!, surfaceId: props.item.id } as const);
  const inspected = createMemo(() => {
    const project = props.ws.projects().find(({ id }) => id === props.item.projectId);
    return project && props.item.access !== 'directory' ? entityOf(project, target()) : undefined;
  });
  const editable = () =>
    props.item.access === 'editable' && !!inspected() && !inspected()!.project.archived;
  const account = () => loadAccountSettings(app.account()?.id);
  const hosted = () => {
    const project = inspected()?.project;
    return !!project && props.ws.sync.statusKey(project) !== 'disabled';
  };
  type Overrides = EntityOverrides | ProjectOverrides;
  // Shown at once while it saves; cleared after the save, so a failure rolls the controls back.
  const [pending, setPending] = createSignal<Overrides>();
  const effective = () => {
    const found = inspected()!;
    const t = found.target;
    const next = pending();
    const project = next
      ? withOverrides(found.project, t, next, account())
      : preserveLegacyProjectSettings(found.project);
    return resolveSettings(account(), project, {
      objectId: t.kind === 'project' ? undefined : t.objectId,
      surfaceId: t.kind === 'surface' ? t.surfaceId : undefined,
    });
  };
  const overrides = (): Overrides => {
    const next = pending();
    if (next) return next;
    const found = inspected()!;
    return found.target.kind === 'project'
      ? (preserveLegacyProjectSettings(found.project).overrides ?? {})
      : editableEntityOverrides(found.entity as RestorationObject | Surface);
  };
  let queued: Overrides | undefined;
  let saving = false;
  // Changes made while one saves are saved after it, in order, against the latest saved project.
  async function flush() {
    if (saving) return;
    saving = true;
    try {
      while (queued) {
        const next = queued;
        queued = undefined;
        const found = inspected();
        if (!found) break;
        const saved = await props.ws.run(() =>
          props.ws.save(withOverrides(found.project, found.target, next, account())),
        );
        if (!saved) queued = undefined;
      }
    } finally {
      saving = false;
      setPending(undefined);
    }
  }
  const change = (next: Overrides) => {
    if (!inspected()) return;
    setPending(() => next);
    queued = next;
    void flush();
  };
  const sectionProps = () => {
    const t = inspected()!.target;
    return {
      language: props.ws.language,
      level: props.item.kind,
      projectId: props.item.projectId,
      objectId: t.kind === 'project' ? undefined : t.objectId,
      surfaceId: t.kind === 'surface' ? t.surfaceId : undefined,
      effective: effective(),
      overrides: overrides(),
      // Not disabled by this panel's own save: the toggle stays put instead of flickering.
      disabled: !editable() || (props.ws.busy() && !pending()),
      onChange: change,
    };
  };
  async function pickLogo() {
    const file = await chooseImage();
    const found = inspected();
    if (!file || !found) return undefined;
    const { saved, logo } = await importLogo(props.ws.vault, found.project, file);
    props.ws.update(saved);
    return logo;
  }
  const status = () => (props.item.access === 'directory' ? 'remote' : props.item.status);
  return (
    <InspectorPanel
      language={props.ws.language}
      title={props.item.name}
      onClose={props.onClose}
      preview={
        <ItemPreview
          language={props.ws.language}
          kind={props.item.kind}
          preview={props.preview}
          directory={props.item.access === 'directory'}
        />
      }
      coverTitle={c().coverTitle}
      cover={
        <Show when={editable() && inspected()}>
          {(found) => <CoverControls ws={props.ws} inspected={found()} />}
        </Show>
      }
      details={<ItemDetails ws={props.ws} item={props.item} hosted={hosted()} />}
      storage={
        <>
          <StatusBadge language={props.ws.language} status={status()} />
          <p>{copy().originals[props.item.originals]}</p>
          <Show when={inspected() && ['conflict', 'error'].includes(props.item.status)}>
            <button
              type="button"
              data-control-id="browser.inspector.settings"
              onClick={() => props.ws.openSettings(props.item.projectId)}
            >
              {c().openSettings}
            </button>
          </Show>
        </>
      }
      restorationDefaults={
        <Show when={inspected()}>
          <RestorationOverridesSection {...sectionProps()} />
        </Show>
      }
      reportBranding={
        <Show when={inspected()}>
          <BrandingOverridesSection {...sectionProps()} onPickLogo={pickLogo} />
        </Show>
      }
      access={
        <Show
          when={inspected()}
          fallback={<p>{props.item.access === 'directory' ? copy().askOwner : copy().readOnly}</p>}
        >
          {(found) => (
            <Show
              when={props.item.kind === 'project'}
              fallback={
                <ProjectWideAccessNote
                  project={found().project}
                  hosted={hosted()}
                  onOpenProject={() => props.ws.openSettings(found().project.id)}
                />
              }
            >
              <ProjectAccessSection
                project={found().project}
                hosted={hosted()}
                account={app.account()}
                canManage={props.item.access === 'editable'}
              />
            </Show>
          )}
        </Show>
      }
    />
  );
}

/** Deck sources for a local entity: the cover when set, otherwise up to three child images. */
export const deckOf = (entity: Parameters<typeof imageDeck>[0]) => ({
  cover: !!entity.cover,
  assets: imageDeck(entity),
});
