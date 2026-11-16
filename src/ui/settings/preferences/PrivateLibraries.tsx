import { createResource, createSignal, For, Show } from 'solid-js';
import type { LocalVault } from '../../../platform/vault/vault';
import { presetRepository } from '../../../platform/estimates/persistence';
import { PatternReview } from '../../editor/checkpoint-review/PatternReview';
import { accountPaths } from '../../router/constants';
import type { Language } from '../../account-access/types';
import './libraries.css';
import { libraryCopy } from './library-copy';

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
            <p role="alert">{c().saveFailed}</p>
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
                  {c().presetName}
                  <input name="name" value={preset.name} required />
                </label>
                <label>
                  {c().value}
                  <input name="value" value={preset.value} required />
                </label>
                <p>
                  v{preset.version} · {preset.currency} /{preset.unit}
                </p>
                <button class="primary">{c().saveVersion}</button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    void presetRepository(props.vault)
                      .save({ ...preset, version: preset.version + 1, archived: true })
                      .then(() => refetch())
                      .catch(() => setFailed(true));
                  }}
                >
                  {c().archive}
                </button>
              </form>
            )}
          </For>
          <a
            href={accountPaths.preferences + '#report-branding'}
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
