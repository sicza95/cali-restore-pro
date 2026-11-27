import { useDialogEntity } from './DialogEntity';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import { imageDeck } from '../../../platform/projects/browser/deck';
import { Icon } from '../../icon/Icon';
import { ActionIcon } from '../browser/item-actions/ActionIcon';
import { StatusBadge } from '../browser';
import type { BrowserPreview } from '../browser';
import { browserCopy } from '../browser/browser-copy';
import { ItemPreview } from '../browser/item-preview/ItemPreview';
import { DialogShell } from '../browser/dialogs/DialogShell';
import { itemActionCopy } from '../browser/item-actions/copy';
import type { ItemAction } from '../browser/item-actions/types';
import { CoverControls } from './CoverControls';
import { ItemDetails } from './ItemDetails';
import { AccessAvatars } from './AccessAvatars';
import { entityOf } from './types';
import type { Workspace } from './types';
import './item-info.css';

export function ItemInspector(props: {
  ws: Workspace;
  item: BrowserItemDescriptor;
  preview?: BrowserPreview;
  onClose: () => void;
  actions: readonly ItemAction[];
  hosted: boolean;
}) {
  const [gallery, setGallery] = createSignal(false);
  const c = () => itemActionCopy[props.ws.language];
  const copy = () => browserCopy[props.ws.language];
  const inspected = createMemo(() => {
    const project = props.ws.projects().find((p) => p.id === props.item.projectId);
    const target =
      props.item.kind === 'project'
        ? { kind: 'project' as const }
        : props.item.kind === 'object'
          ? { kind: 'object' as const, objectId: props.item.id }
          : { kind: 'surface' as const, objectId: props.item.objectId!, surfaceId: props.item.id };
    return project ? entityOf(project, target) : undefined;
  });
  const summary = useDialogEntity(
    () => props.ws,
    () => props.item,
    () => false,
  );
  const share = () => props.actions.find((action) => action.id === 'share');
  return (
    <div class="browser-inspector-panel project-item-info">
      <header>
        <h2>{props.item.name}</h2>
        <button
          type="button"
          class="browser-action"
          aria-label={copy().close}
          data-control-id="browser.inspector.close"
          onClick={() => props.onClose()}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <button
        type="button"
        class="project-cover-preview"
        aria-label={copy().preview}
        disabled={!inspected() || props.item.access !== 'editable'}
        onClick={() => setGallery(true)}
      >
        <div aria-hidden="true">
          <ItemPreview
            language={props.ws.language}
            kind={props.item.kind}
            preview={props.preview}
          />
        </div>
        <span class="project-cover-pencil">
          <Icon name="pen" size={18} />
        </span>
      </button>
      <For
        each={props.actions.filter((action) => ['hosting', 'sync', 'listed'].includes(action.id))}
      >
        {(action) => (
          <label class="project-info-toggle">
            <span class="project-info-toggle-label">
              <ActionIcon icon={action.icon} supplement={action.supplement} />
              {action.label}
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={action.checked}
              disabled={!!action.reason}
              title={action.reason}
              onChange={() => action.run()}
            />
          </label>
        )}
      </For>
      <StatusBadge hosted={props.hosted} language={props.ws.language} status={props.item.status} />
      <Show
        when={props.ws.sync
          .state()
          ?.checkpoints.some((base) => base.project === props.item.projectId && base.paused)}
      >
        <p>{c().paused}</p>
      </Show>
      <hr />
      <AccessAvatars ws={props.ws} item={props.item} hosted={props.hosted} />
      <button
        type="button"
        data-control-id="browser.access.manage"
        disabled={!!share()?.reason}
        onClick={() => share()?.run()}
      >
        {c().access}
      </button>
      <hr />
      <ItemDetails ws={props.ws} item={props.item} hosted={props.hosted} />
      <Show when={gallery() && inspected()}>
        {(found) => (
          <DialogShell
            title={copy().preview}
            sidebar={summary()}
            closeLabel={copy().close}
            onClose={() => setGallery(false)}
          >
            <CoverControls ws={props.ws} inspected={found()} />
          </DialogShell>
        )}
      </Show>
    </div>
  );
}

/** Deck sources for a local entity: the cover when set, otherwise up to three child images. */
export const deckOf = (entity: Parameters<typeof imageDeck>[0]) => ({
  cover: !!entity.cover,
  assets: imageDeck(entity),
});
