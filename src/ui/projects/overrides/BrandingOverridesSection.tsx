import { createSignal, For, onCleanup, Show } from 'solid-js';
import type { ReportBranding } from '../../../platform/projects/browser-contracts';
import { resetOverride } from '../../../platform/projects/settings';
import { settingsCopy } from '../../settings/settings-copy';
import { OverrideField } from './OverrideField';
import { overridesCopy } from './copy';
import type { BrandingOverridesSectionProps } from './types';

const fields = ['studio', 'contact', 'footer', 'accent', 'logo'] as const;
const limits = { studio: 120, contact: 254, footer: 240, accent: 7 };

export function BrandingOverridesSection(props: BrandingOverridesSectionProps) {
  const c = () => settingsCopy[props.language];
  const o = () => overridesCopy[props.language];
  const [picking, setPicking] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let mounted = true;
  onCleanup(() => {
    mounted = false;
  });
  const id = (key: string) =>
    `overrides.${props.level}.${props.surfaceId ?? props.objectId ?? props.projectId}.branding.${key}`;
  const active = (key: keyof ReportBranding) => Object.hasOwn(props.overrides.branding ?? {}, key);
  const reset = (key: keyof ReportBranding) =>
    props.onChange(resetOverride(props.overrides, 'branding', key));
  function update<K extends keyof ReportBranding>(key: K, value: ReportBranding[K]) {
    props.onChange({ ...props.overrides, branding: { ...props.overrides.branding, [key]: value } });
  }
  function toggle(key: keyof ReportBranding, enabled: boolean) {
    if (!enabled) return reset(key);
    if (key !== 'logo') return update(key, props.effective.branding[key].value);
    const logo = props.effective.branding.logo.value;
    update('logo', logo && 'assetId' in logo ? logo : null);
  }
  async function pick() {
    setPicking(true);
    setFailed(false);
    const path = id('logo');
    try {
      const logo = await props.onPickLogo();
      if (mounted && logo !== undefined && path === id('logo') && !props.disabled)
        update('logo', logo);
    } catch {
      setFailed(true);
    } finally {
      setPicking(false);
    }
  }
  return (
    <section class="project-overrides" aria-label={c().branding}>
      <h3>{c().branding}</h3>
      <For each={fields}>
        {(key) => (
          <OverrideField
            language={props.language}
            id={id(key)}
            label={key === 'logo' ? o().logo : c()[key]}
            value={
              key === 'logo'
                ? props.effective.branding.logo.value
                  ? o().selectedLogo
                  : o().noLogo
                : props.effective.branding[key].value
            }
            source={props.effective.branding[key].source}
            level={props.level}
            active={active(key)}
            disabled={props.disabled || picking()}
            onToggle={(enabled) => toggle(key, enabled)}
            onReset={() => reset(key)}
          >
            {key === 'logo' ? (
              <div class="project-override-actions">
                <button
                  type="button"
                  disabled={!active(key)}
                  data-control-id={`${id(key)}.pick`}
                  onClick={() => void pick()}
                >
                  {o().chooseLogo}
                </button>
                <button
                  type="button"
                  disabled={!active(key)}
                  data-control-id={`${id(key)}.clear`}
                  onClick={() => update('logo', null)}
                >
                  {c().removeLogo}
                </button>
              </div>
            ) : (
              <label>
                <span class="project-override-label">{c()[key]}</span>
                <input
                  data-control-id={id(key)}
                  type={key === 'accent' ? 'color' : 'text'}
                  maxlength={limits[key]}
                  disabled={!active(key)}
                  value={props.effective.branding[key].value}
                  onChange={(event) => update(key, event.currentTarget.value)}
                />
              </label>
            )}
          </OverrideField>
        )}
      </For>
      <Show when={failed()}>
        <p role="alert">{o().logoFailed}</p>
      </Show>
    </section>
  );
}
