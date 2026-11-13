import { For, Show, untrack } from 'solid-js';
import type { ReportCopy } from '../../../platform/reports/copy';
import { brandingSources } from '../../../platform/reports/types';
import type { useReport } from './useReport';
import { ReviewCheck, ReviewSelect } from './fields';
import { reportControl as id } from './report-controls';

const limits = { studio: 120, contact: 254, footer: 240 };

export function BrandingSettings(props: { copy: ReportCopy; model: ReturnType<typeof useReport> }) {
  const c = () => props.copy;
  const m = untrack(() => props.model);
  const custom = () => m.brand() ?? m.defaults;
  return (
    <section class="project-pane">
      <h3>{c().branding}</h3>
      <ReviewSelect
        id={id('branding')}
        label={c().branding}
        value={m.settings.brandingSource}
        options={brandingSources}
        text={(key) => c()[key]}
        change={(source) => {
          m.set('brandingSource', source);
          if (source === 'defaults') m.setBrand(undefined);
        }}
      />
      <Show when={m.settings.brandingSource === 'override'}>
        <div class="review-fields">
          <For each={Object.keys(limits) as (keyof typeof limits)[]}>
            {(key) => (
              <label>
                {c()[key]}
                <input
                  data-control-id={id(key)}
                  value={custom()[key]}
                  maxlength={limits[key]}
                  onInput={(e) => m.setBrand({ ...custom(), [key]: e.currentTarget.value })}
                />
              </label>
            )}
          </For>
          <label>
            {c().accent}
            <input
              data-control-id={id('accent')}
              type="color"
              value={custom().accent}
              onInput={(e) => m.setBrand({ ...custom(), accent: e.currentTarget.value })}
            />
          </label>
        </div>
        <Show when={m.defaults.logo || custom().logo}>
          <ReviewCheck
            id={id('logo')}
            checked={!!custom().logo}
            change={(enabled) => m.setBrand({ ...custom(), logo: enabled ? m.defaults.logo : '' })}
          >
            {c().logo}
          </ReviewCheck>
        </Show>
      </Show>
    </section>
  );
}
