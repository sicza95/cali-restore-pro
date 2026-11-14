import { createResource, createSignal, For, Show } from 'solid-js';
import type { LocalVault } from '../../../../platform/vault/vault';
import { presetRepository } from '../../../../platform/estimates/persistence';
import { PatternReview } from '../../../editor/checkpoint-review/PatternReview';
import { accountDestinations } from '../../routes';
import type { Language } from '../../types';
import './libraries.css';

export const libraryCopy = {
  en: {
    title: 'Estimate libraries',
    rates: 'Rate presets',
    productivity: 'Productivity presets',
    help: 'Encrypted on this device, separate from projects. Create presets from an estimate phase. Edits never rewrite captured estimate versions.',
    branding: 'Report branding preferences',
  },
  hu: {
    title: 'Becslési könyvtárak',
    rates: 'Díjsablonok',
    productivity: 'Termelékenységi sablonok',
    help: 'Az eszközön titkosítva, a projektektől külön. A becslési fázisból hozhat létre sablonokat. A módosítás nem írja át a mentett becslést.',
    branding: 'Jelentésarculat beállításai',
  },
};

export function PrivateLibraries(props: { language: Language; vault: LocalVault }) {
  const c = () => libraryCopy[props.language];
  const [rows, { refetch }] = createResource(() => presetRepository(props.vault).list());
  const [kind, setKind] = createSignal('rate');
  const [failed, setFailed] = createSignal(false);
  const latest = () =>
    (rows() ?? []).filter(
      (p, _, all) =>
        !p.archived &&
        p.kind === kind() &&
        !all.some((v) => v.id === p.id && v.version > p.version),
    );
  return (
    <>
      <section class="account-section">
        <div>
          <h2>{c().title}</h2>
          <p id="estimate-library-help">{c().help}</p>
        </div>
        <div class="account-panel private-library-actions">
          <For each={['rates', 'productivity'] as const}>
            {(key) => (
              <button
                type="button"
                class="secondary"
                data-control-id={`libraries.${key}`}
                aria-describedby="estimate-library-help"
                aria-pressed={kind() === (key === 'rates' ? 'rate' : 'productivity')}
                onClick={() => setKind(key === 'rates' ? 'rate' : 'productivity')}
              >
                {c()[key]}
              </button>
            )}
          </For>
          <Show when={failed() || rows.error}>
            <p role="alert">
              {props.language === 'hu' ? 'A sablon nem menthető.' : 'Could not save preset.'}
            </p>
          </Show>
          <For each={latest()}>
            {(preset) => (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fields = new FormData(e.currentTarget);
                  void presetRepository(props.vault)
                    .save({
                      ...preset,
                      version: preset.version + 1,
                      name: String(fields.get('name')),
                      value: String(fields.get('value')),
                      archived: fields.get('action') === 'archive',
                    })
                    .then(() => refetch())
                    .catch(() => setFailed(true));
                }}
              >
                <label>
                  {props.language === 'hu' ? 'Sablon neve' : 'Preset name'}
                  <input name="name" value={preset.name} required />
                </label>
                <label>
                  {props.language === 'hu' ? 'Érték' : 'Value'}
                  <input name="value" value={preset.value} required />
                </label>
                <p>
                  v{preset.version} · {preset.currency} /{preset.unit}
                </p>
                <button>
                  {props.language === 'hu' ? 'Új verzió mentése' : 'Save new version'}
                </button>
                <button
                  class="secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    void presetRepository(props.vault)
                      .save({ ...preset, version: preset.version + 1, archived: true })
                      .then(() => refetch())
                      .catch(() => setFailed(true));
                  }}
                >
                  {props.language === 'hu' ? 'Archiválás' : 'Archive'}
                </button>
              </form>
            )}
          </For>
          <a
            href={accountDestinations.preferences + '#report-branding'}
            data-control-id="libraries.branding"
          >
            {c().branding}
          </a>
        </div>
      </section>
      <PatternReview language={props.language} vault={props.vault} library />
    </>
  );
}
