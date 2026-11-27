import { useItemGesture } from '../item-actions/useItemGesture';
import { ItemMenuTrigger } from '../item-actions/ItemMenuTrigger';
import { InlineName } from '../item-actions/InlineName';
import { browserCopy } from '../browser-copy';
import { StatusBadge } from '../status-badge/StatusBadge';
import { VisibilityBadge } from '../status-badge/VisibilityBadge';
import { ItemPreview } from '../item-preview/ItemPreview';
import type { ItemProps } from '../types';
import '../styles.css';

export function ItemRow(props: ItemProps) {
  const gestures = useItemGesture((x, y) => props.onContextMenu?.(x, y));
  const copy = () => browserCopy[props.language];
  return (
    <div
      class="browser-row"
      {...gestures}
      role="gridcell"
      aria-selected={props.selected}
      tabIndex={props.tabIndex}
      data-browser-item={props.item.id}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onSelect();
      }}
      onClick={() => props.onSelect()}
      onContextMenu={(event) => {
        if (props.onContextMenu) {
          event.preventDefault();
          props.onContextMenu(event.clientX, event.clientY);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          props.onContextMenu?.(rect.left, rect.top);
        }
      }}
      onDblClick={(event) => {
        if ((event.target as Element).closest('button, input')) return;
        if (props.item.access !== 'directory') props.onOpen();
      }}
    >
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
      <ItemPreview
        language={props.language}
        kind={props.item.kind}
        preview={props.preview}
        directory={props.item.access === 'directory'}
      />
      <div class="browser-row-identity">
        <InlineName
          name={props.item.name}
          language={props.language}
          editing={props.editing}
          onSave={props.onSaveName}
          onCancel={props.onCancelName}
        />
        <span class="browser-sr-only">
          {props.item.access === 'directory' ? copy().askOwner : undefined}
        </span>
      </div>
    </div>
  );
}
