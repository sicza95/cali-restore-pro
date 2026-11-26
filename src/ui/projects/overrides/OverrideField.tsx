import { Show, type JSX } from 'solid-js';
import type { SettingsSource } from '../../../platform/projects/settings';
import type { Language } from '../../../platform/i18n/language';
import { overridesCopy } from './copy';
import './overrides.css';

export function OverrideField(props: {
  language: Language;
  id: string;
  label: string;
  value: string;
  source: SettingsSource;
  level: SettingsSource;
  active: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onToggle: (active: boolean) => void;
  onReset: () => void;
  children: JSX.Element;
}) {
  const c = () => overridesCopy[props.language];
  return (
    <fieldset class="project-override-field" disabled={props.disabled}>
      <legend>{props.label}</legend>
      <p class="project-override-value">{props.value || c().empty}</p>
      <p class="project-override-source">
        {props.source === props.level ? c().overridden : c().inherited(c()[props.source])}
      </p>
      <Show
        when={!props.readOnly}
        fallback={<p class="project-override-source">{c().projectCurrency}</p>}
      >
        <div class="project-override-actions">
          <label>
            <input
              type="checkbox"
              checked={props.active}
              data-control-id={`${props.id}.override`}
              aria-label={`${props.label}: ${c().override}`}
              onChange={(event) => props.onToggle(event.currentTarget.checked)}
            />
            {c().override}
          </label>
          <button
            type="button"
            disabled={!props.active}
            data-control-id={`${props.id}.reset`}
            aria-label={`${props.label}: ${c().reset}`}
            onClick={() => props.onReset()}
          >
            {c().reset}
          </button>
        </div>
        {props.children}
      </Show>
    </fieldset>
  );
}
