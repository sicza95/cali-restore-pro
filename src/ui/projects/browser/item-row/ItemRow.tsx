import { browserCopy } from '../browser-copy';
import { StatusBadge } from '../status-badge/StatusBadge';
import { ItemPreview } from '../item-preview/ItemPreview';
import type { ItemProps } from '../types';
import '../styles.css';

export function ItemRow(props: ItemProps) {
  const copy = () => browserCopy[props.language];
  return (
    <div
      class="browser-row"
      role="gridcell"
      aria-selected={props.selected}
      tabIndex={props.tabIndex}
      data-browser-item={props.item.id}
      onFocus={(event) => {
        if (event.target === event.currentTarget) props.onSelect();
      }}
      onClick={() => props.onSelect()}
      onDblClick={() => {
        if (props.item.access !== 'directory') props.onOpen();
      }}
    >
      <span class="browser-item-status">
        <StatusBadge
          language={props.language}
          status={props.item.access === 'directory' ? 'remote' : props.item.status}
        />
      </span>
      <ItemPreview
        language={props.language}
        kind={props.item.kind}
        preview={props.preview}
        directory={props.item.access === 'directory'}
      />
      <div class="browser-row-identity">
        <strong class="browser-item-name" title={props.item.name}>
          {props.item.name}
        </strong>
        <span class="browser-sr-only">
          {props.item.access === 'directory' ? copy().askOwner : undefined}
        </span>
      </div>
    </div>
  );
}
