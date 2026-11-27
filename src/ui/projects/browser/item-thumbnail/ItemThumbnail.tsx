import { Show } from 'solid-js';
import { Icon } from '../../../icon/Icon';
import { itemActionCopy } from '../item-actions/copy';
import { ItemMenuTrigger } from '../item-actions/ItemMenuTrigger';
import { StatusBadge } from '../status-badge/StatusBadge';
import { VisibilityBadge } from '../status-badge/VisibilityBadge';
import { ItemPreview } from '../item-preview/ItemPreview';
import type { ItemProps } from '../types';
import './styles.css';

/** Thumbnail decorations share the preview's coordinate space, separate from the item name. */
export function ItemThumbnail(
  props: Pick<ItemProps, 'language' | 'item' | 'preview' | 'onContextMenu'>,
) {
  return (
    <div class="browser-thumbnail" data-archived={props.item.archived ? 'true' : undefined}>
      <ItemPreview
        language={props.language}
        kind={props.item.kind}
        preview={props.preview}
        directory={props.item.access === 'directory'}
      />
      <ItemMenuTrigger language={props.language} onOpen={props.onContextMenu} />
      <Show when={props.item.archived}>
        <span
          class="browser-item-archived"
          role="img"
          aria-label={itemActionCopy[props.language].archived}
          title={itemActionCopy[props.language].archived}
        >
          <Icon name="archive" size={18} />
        </span>
      </Show>
      <span class="browser-item-status">
        <StatusBadge
          language={props.language}
          hosted={props.item.hosted}
          status={props.item.access === 'directory' ? 'remote' : props.item.status}
        />
      </span>
      <span class="browser-item-visibility">
        <VisibilityBadge visibility={props.item.visibility} language={props.language} />
      </span>
    </div>
  );
}
