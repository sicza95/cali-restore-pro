import { createResource, createSignal, For, Show } from 'solid-js';
import {
  bounds,
  defaults,
  kinds,
  patternKey,
  patternLibrary,
  validTile,
} from '../../../platform/projects/patterns';
import type { PatternVersion, Tile } from '../../../platform/projects/patterns';
import type { LocalVault } from '../../../platform/vault/vault';
import { TilePreview } from './TilePattern';
import { PatternMotif } from './PatternMotif';
import type { Language } from '../../account-access/types';
import { checkpointCopy } from './copy';
import './styles.css';

const control = (key: string) => 'pattern.review.' + key;

export function PatternReview(props: { language: Language; library?: boolean; vault: LocalVault }) {
  const c = () => checkpointCopy[props.language];
  const [tile, setTile] = createSignal(defaults);
  const [mono, setMono] = createSignal(false);
  const [name, setName] = createSignal('');
  const [selected, setSelected] = createSignal('');
  const library = () => patternLibrary(props.vault);
  const [rows, { refetch }] = createResource(() => library().list());
  const [saving, setSaving] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const presets = (): PatternVersion[] => (rows.error ? [] : (rows() ?? []));
  const [applied, setApplied] = createSignal<{ tile: Tile; mono: boolean }>();
  const valid = () => validTile(tile());
  async function save() {
    const title = name().trim();
    if (!valid() || !title || saving()) return;
    setSaving(true);
    setFailed(false);
    try {
      const next = await library().save(title, tile());
      await refetch();
      setSelected(patternKey(next));
    } catch {
      setFailed(true);
      void refetch();
    } finally {
      setSaving(false);
    }
  }
  return (
    <section class="project-pane review-pattern">
      <h3>{c().patterns}</h3>
      <Show when={props.library}>
        <p class="review-note">{c().personal}</p>
      </Show>
      <Show when={!props.library}>
        <a class="project-back" data-control-id={control('library')} href="/settings/libraries">
          {c().openLibrary}
        </a>
      </Show>
      <TilePreview tile={tile()} mono={mono()} label={c().preview} />
      <div class="review-fields">
        <label>
          {c().kind}
          <select
            data-control-id={control('kind')}
            value={tile().kind}
            onChange={(e) => setTile({ ...tile(), kind: e.currentTarget.value as Tile['kind'] })}
          >
            <For each={kinds}>{(key) => <option value={key}>{c()[key]}</option>}</For>
          </select>
        </label>
        <For each={Object.keys(bounds) as (keyof typeof bounds)[]}>
          {(key) => (
            <label>
              {c()[key]} · {tile()[key]}
              <input
                data-control-id={control(key)}
                type="range"
                min={bounds[key][0]}
                max={bounds[key][1]}
                value={tile()[key]}
                onInput={(e) => setTile({ ...tile(), [key]: e.currentTarget.valueAsNumber })}
              />
            </label>
          )}
        </For>
        <label>
          {c().color}
          <input
            data-control-id={control('color')}
            type="color"
            value={tile().color}
            onInput={(e) => setTile({ ...tile(), color: e.currentTarget.value })}
          />
        </label>
        <Show when={tile().kind === 'motif'}>
          <label>
            {c().motif}
            <input
              data-control-id={control('motif')}
              maxlength="3"
              value={tile().motif}
              onInput={(e) => setTile({ ...tile(), motif: e.currentTarget.value })}
            />
          </label>
        </Show>
        <Show when={tile().kind === 'custom'}>
          <PatternMotif
            points={tile().points ?? []}
            onChange={(points) => setTile({ ...tile(), points })}
            label={c().custom}
            clear={c().clearMotif}
          />
        </Show>
        <label class="review-check">
          <input
            data-control-id={control('mono')}
            type="checkbox"
            checked={mono()}
            onChange={(e) => setMono(e.currentTarget.checked)}
          />
          {c().mono}
        </label>
      </div>
      <div class="review-fields">
        <label>
          {c().preset}
          <select
            data-control-id={control('preset')}
            disabled={!presets().length}
            value={selected()}
            onChange={(e) => {
              const next = presets().find((entry) => patternKey(entry) === e.currentTarget.value);
              setSelected(next ? patternKey(next) : '');
              if (next) {
                setTile(next.tile);
                setName(next.name);
              }
            }}
          >
            <option value="">{presets().length ? '—' : c().empty}</option>
            <For each={presets()}>
              {(entry) => (
                <option value={patternKey(entry)} selected={selected() === patternKey(entry)}>
                  {entry.name} · v{entry.version}
                </option>
              )}
            </For>
          </select>
        </label>
        <label>
          {c().presetName}
          <input
            data-control-id={control('presetName')}
            maxlength="80"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
      </div>
      <div class="review-actions">
        <button
          type="button"
          data-control-id={control('save')}
          disabled={!valid() || !name().trim() || saving() || rows.loading}
          onClick={save}
        >
          {c().save}
        </button>
        <button
          type="button"
          class="secondary"
          data-control-id={control('apply')}
          disabled={!valid()}
          onClick={() => setApplied({ tile: tile(), mono: mono() })}
        >
          {c().apply}
        </button>
      </div>
      <Show when={failed() || rows.error}>
        <p role="alert">{c().patternError}</p>
      </Show>
      <Show when={applied()}>
        {(snapshot) => (
          <div role="status">
            <p>{c().applied}</p>
            <TilePreview tile={snapshot().tile} mono={snapshot().mono} label={c().apply} />
          </div>
        )}
      </Show>
    </section>
  );
}
