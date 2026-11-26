import type { JSX } from 'solid-js';
import type { BrowserItemKind } from '../../../../platform/projects/browser-contracts';
import type { Language } from '../../../../platform/i18n/language';
import type { BrowserPreview } from '../types';
import { ItemPreview } from '../item-preview/ItemPreview';

/** The affected entity, using the browser's grid thumbnail and name treatment. */
export function DialogItem(props: {
  language: Language;
  kind: BrowserItemKind;
  name: string;
  preview?: BrowserPreview;
  children?: JSX.Element;
}) {
  return (
    <div class="browser-dialog-item">
      <div class="browser-dialog-item-card">
        <ItemPreview language={props.language} kind={props.kind} preview={props.preview} />
        <strong class="browser-item-name">{props.name}</strong>
      </div>
      {props.children}
    </div>
  );
}
