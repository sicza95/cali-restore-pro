import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { browserCopy } from '../browser-copy';
import { Icon } from '../../../icon/Icon';
import type { InspectorPanelProps } from '../types';
import '../styles.css';

export function InspectorPanel(props: InspectorPanelProps) {
  const copy = () => browserCopy[props.language];
  return (
    <div class="browser-inspector-panel">
      <header>
        <h2>{props.title}</h2>
        <button
          type="button"
          class="browser-action"
          aria-label={`${copy().close}: ${copy().inspector}`}
          title={copy().close}
          data-control-id="browser.inspector.close"
          onClick={() => props.onClose()}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div class="browser-inspector-preview">{props.preview}</div>
      <div class="browser-inspector-storage">{props.storage}</div>
      <Show when={props.cover}>
        <InspectorSection title={props.coverTitle ?? copy().preview}>
          {props.cover}
        </InspectorSection>
      </Show>
      <InspectorSection title={copy().details}>{props.details}</InspectorSection>
      <InspectorSection title={copy().restorationDefaults}>
        {props.restorationDefaults}
      </InspectorSection>
      <InspectorSection title={copy().reportBranding}>{props.reportBranding}</InspectorSection>
      <InspectorSection title={copy().access}>{props.access}</InspectorSection>
    </div>
  );
}

function InspectorSection(props: { title: string; children?: JSX.Element }) {
  return (
    <details class="browser-inspector-section">
      <summary>{props.title}</summary>
      <div class="browser-inspector-section-body">{props.children}</div>
    </details>
  );
}
