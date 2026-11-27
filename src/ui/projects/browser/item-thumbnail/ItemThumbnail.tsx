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
    <div class="browser-thumbnail">
      <ItemPreview
        language={props.language}
        kind={props.item.kind}
        preview={props.preview}
        directory={props.item.access === 'directory'}
      />
      <ItemMenuTrigger language={props.language} onOpen={props.onContextMenu} />
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
