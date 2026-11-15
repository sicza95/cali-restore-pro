import { createResource, createSignal, For, Show } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Phase, Preset } from '../../../platform/estimates/types';
import { applyPreset, presetRepository } from '../../../platform/estimates/persistence';
import { formatArea, formatRate } from '../../../platform/format/number';
import type { Language } from '../types';

/** "HUF 40/h" for a rate, "2.5 m²/h" for a productivity. */
function presetValue(preset: Preset, language: Language) {
  const unit = preset.unit === 'hourly' ? 'h' : preset.unit === 'fixed' ? undefined : preset.unit;
  if (preset.kind === 'rate')
    return formatRate(preset.value, preset.currency ?? '', unit, language);
  return unit && unit !== 'h' ? formatArea(preset.value, unit, language) + '/h' : preset.value;
}

export function PresetInputs(props: {
  vault: LocalVault;
  language: Language;
  phase: Phase;
  currency: string;
  update: (next: Partial<Phase>) => void;
}) {
  const [presets, { refetch }] = createResource(() => presetRepository(props.vault).list());
  const [name, setName] = createSignal('');
  const [status, setStatus] = createSignal('');
  const c = () =>
    props.language === 'hu'
      ? {
          title: 'Privát sablonok',
          name: 'Sablon neve',
          rate: 'Díj mentése',
          speed: 'Teljesítmény mentése',
          apply: 'Alkalmazás',
          saved: 'Sablon mentve',
          failed: 'Érvénytelen vagy ütköző sablon',
        }
      : {
          title: 'Private presets',
          name: 'Preset name',
          rate: 'Save rate preset',
          speed: 'Save productivity preset',
          apply: 'Apply',
          saved: 'Preset saved',
          failed: 'Invalid or conflicting preset',
        };
  const latest = () =>
    (presets() ?? []).filter(
      (p, _, all) => !p.archived && !all.some((v) => v.id === p.id && v.version > p.version),
    );
  async function save(kind: Preset['kind']) {
    try {
      const p = props.phase;
      const unit = kind === 'productivity' || p.price === 'area' ? p.units : p.price;
      const previous = latest().find((v) => v.name === name().trim() && v.kind === kind);
      await presetRepository(props.vault).save({
        id: previous?.id ?? crypto.randomUUID(),
        version: (previous?.version ?? 0) + 1,
        name: name().trim(),
        kind,
        unit,
        archived: false,
        currency: kind === 'rate' ? props.currency : null,
        value: kind === 'rate' ? (p.rate[unit] ?? '') : (p.productivity[p.units] ?? ''),
      });
      await refetch();
      setStatus(c().saved);
    } catch {
      setStatus(c().failed);
    }
  }
  return (
    <section class="review-inset">
      <h4>{c().title}</h4>
      <label>
        {c().name}
        <input value={name()} maxlength="80" onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="review-actions">
        <button
          type="button"
          class="secondary"
          disabled={!name().trim()}
          onClick={() => void save('rate')}
        >
          {c().rate}
        </button>
        <button
          type="button"
          class="secondary"
          disabled={!name().trim()}
          onClick={() => void save('productivity')}
        >
          {c().speed}
        </button>
      </div>
      <p role="status">{status()}</p>
      <Show when={presets.error}>
        <p role="alert">{c().failed}</p>
      </Show>
      <ul class="project-register">
        <For each={latest()}>
          {(preset) => (
            <li>
              <span>
                {preset.name} · v{preset.version} · {presetValue(preset, props.language)}
              </span>
              <button
                type="button"
                class="secondary"
                disabled={preset.kind === 'rate' && preset.currency !== props.currency}
                onClick={() => {
                  try {
                    props.update(applyPreset(props.phase, preset, props.currency));
                  } catch {
                    setStatus(c().failed);
                  }
                }}
              >
                {c().apply}
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
