import { For } from 'solid-js';
import type { RestorationDefaults } from '../../../platform/projects/browser-contracts';
import { resetOverride } from '../../../platform/projects/settings';
import { settingsCopy } from '../../settings/settings-copy';
import { restorationPreferenceCopy } from '../../settings/preferences/copy';
import { languageNames, type Language } from '../../../platform/i18n/language';
import { OverrideField } from './OverrideField';
import { overridesCopy } from './copy';
import type { OverridesSectionProps } from './types';

const fields = ['units', 'areaUnit', 'currency', 'reportLanguage', 'snap'] as const;
const options = {
  units: ['metric', 'imperial'],
  areaUnit: ['cm²', 'm²', 'in²', 'ft²'],
  currency: ['HUF', 'EUR', 'GBP', 'USD', 'CHF'],
  reportLanguage: ['en', 'hu'],
};

export function RestorationOverridesSection(props: OverridesSectionProps) {
  const c = () => settingsCopy[props.language];
  const p = () => restorationPreferenceCopy[props.language];
  const o = () => overridesCopy[props.language];
  const label = (key: keyof RestorationDefaults) =>
    key === 'units' ? p().measurementUnits : key === 'areaUnit' ? c().units : c()[key];
  const active = (key: keyof RestorationDefaults) =>
    Object.hasOwn(props.overrides.restoration ?? {}, key);
  const id = (key: string) =>
    `overrides.${props.level}.${props.surfaceId ?? props.objectId ?? props.projectId}.restoration.${key}`;
  function update<K extends keyof RestorationDefaults>(key: K, value: RestorationDefaults[K]) {
    if (key === 'currency' && props.level !== 'project') return;
    props.onChange({
      ...props.overrides,
      restoration: { ...props.overrides.restoration, [key]: value },
    });
  }
  const reset = (key: keyof RestorationDefaults) =>
    props.onChange(resetOverride(props.overrides, 'restoration', key));
  const shown = (key: keyof RestorationDefaults) => {
    const value = props.effective.restoration[key].value;
    if (typeof value === 'boolean') return value ? o().on : o().off;
    if (key === 'reportLanguage') return languageNames[value as Language];
    return key === 'units' ? p()[value as 'metric' | 'imperial'] : value;
  };
  return (
    <section class="project-overrides" aria-label={c().defaults}>
      <h3>{c().defaults}</h3>
      <For each={fields}>
        {(key) => (
          <OverrideField
            language={props.language}
            id={id(key)}
            label={label(key)}
            value={shown(key)}
            source={props.effective.restoration[key].source}
            level={props.level}
            active={active(key)}
            disabled={props.disabled}
            readOnly={key === 'currency' && props.level !== 'project'}
            onToggle={(enabled) =>
              enabled ? update(key, props.effective.restoration[key].value) : reset(key)
            }
            onReset={() => reset(key)}
          >
            {key === 'snap' ? (
              <label>
                <input
                  type="checkbox"
                  data-control-id={id(key)}
                  checked={props.effective.restoration.snap.value}
                  disabled={!active(key)}
                  onChange={(event) => update('snap', event.currentTarget.checked)}
                />
                {label(key)}
              </label>
            ) : (
              <label>
                <span class="project-override-label">{label(key)}</span>
                <select
                  data-control-id={id(key)}
                  value={String(props.effective.restoration[key].value)}
                  disabled={!active(key)}
                  onChange={(event) => update(key, event.currentTarget.value as never)}
                >
                  <For each={options[key]}>
                    {(value) => (
                      <option
                        value={value}
                        selected={value === props.effective.restoration[key].value}
                      >
                        {key === 'units'
                          ? p()[value as 'metric' | 'imperial']
                          : key === 'reportLanguage'
                            ? languageNames[value as Language]
                            : value}
                      </option>
                    )}
                  </For>
                </select>
              </label>
            )}
          </OverrideField>
        )}
      </For>
    </section>
  );
}
