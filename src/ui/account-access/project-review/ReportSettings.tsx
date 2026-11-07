import { createSignal, For, Show, untrack } from 'solid-js';
import type { ReportCopy } from './report-copy';
import type { Branding } from './report-model';
import { ReviewCheck, ReviewSelect } from './fields';
import { reportControl as id } from './report-controls';

const sources = ['omit', 'defaults', 'override'] as const;
type Source = (typeof sources)[number];
const limits = { studio: 120, contact: 254, footer: 240 };

export function createBranding(defaults: Branding) {
  const [source, setSource] = createSignal<Source>('omit');
  const [custom, setCustom] = createSignal(defaults);
  const [logo, setLogo] = createSignal(true);
  const branding = () => {
    if (source() === 'omit') return;
    const value = source() === 'defaults' ? defaults : custom();
    return {
      ...value,
      accent: /^#[a-f0-9]{6}$/i.test(value.accent) ? value.accent : '#000000',
      logo:
        (source() === 'defaults' || logo()) &&
        /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.logo)
          ? value.logo
          : '',
    };
  };
  return { source, setSource, custom, setCustom, logo, setLogo, branding };
}

export function BrandingSettings(props: {
  copy: ReportCopy;
  model: ReturnType<typeof createBranding>;
}) {
  const c = () => props.copy;
  const m = untrack(() => props.model);
  return (
    <section class="project-pane">
      <h3>{c().branding}</h3>
      <ReviewSelect
        id={id('branding')}
        label={c().branding}
        value={m.source()}
        options={sources}
        text={(key) => c()[key]}
        change={m.setSource}
      />
      <Show when={m.source() === 'override'}>
        <div class="review-fields">
          <For each={Object.keys(limits) as (keyof typeof limits)[]}>
            {(key) => (
              <label>
                {c()[key]}
                <input
                  data-control-id={id(key)}
                  value={m.custom()[key]}
                  maxlength={limits[key]}
                  onInput={(e) => m.setCustom({ ...m.custom(), [key]: e.currentTarget.value })}
                />
              </label>
            )}
          </For>
          <label>
            {c().accent}
            <input
              data-control-id={id('accent')}
              type="color"
              value={m.custom().accent}
              onInput={(e) => m.setCustom({ ...m.custom(), accent: e.currentTarget.value })}
            />
          </label>
        </div>
        <Show when={m.custom().logo}>
          <ReviewCheck id={id('logo')} checked={m.logo()} change={m.setLogo}>
            {c().logo}
          </ReviewCheck>
        </Show>
      </Show>
    </section>
  );
}
