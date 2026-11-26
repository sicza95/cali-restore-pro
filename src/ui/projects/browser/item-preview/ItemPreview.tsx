import { createSignal, For, Show } from 'solid-js';
import type { Language } from '../../../../platform/i18n/language';
import type { BrowserItemKind } from '../../../../platform/projects/browser-contracts';
import { Icon } from '../../../icon/Icon';
import { browserCopy } from '../browser-copy';
import type { BrowserPreview } from '../types';

export function ItemPreview(props: {
  language: Language;
  kind: BrowserItemKind;
  preview?: BrowserPreview;
  directory?: boolean;
}) {
  // Directory entries must never reveal a supplied descendant image or cover.
  const images = () =>
    props.directory
      ? []
      : props.preview?.cover
        ? [props.preview.cover]
        : (props.preview?.images ?? []).slice(0, 3);
  return (
    <div class="browser-preview" aria-label={browserCopy[props.language].preview} role="img">
      <div class="browser-preview-placeholder">
        <Icon name={props.kind === 'surface' ? 'photo' : 'folder'} size={28} />
        <span>{browserCopy[props.language].noPreview}</span>
      </div>
      <For each={images()}>{(src, index) => <PreviewCard src={src} index={index()} />}</For>
    </div>
  );
}

function PreviewCard(props: { src: string; index: number }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show when={!failed()}>
      <img
        class="browser-preview-card"
        data-card={props.index}
        src={props.src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
