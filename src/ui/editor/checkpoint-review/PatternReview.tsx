import { createSignal, createUniqueId, For, Show } from 'solid-js';
import type { Language } from '../../account-access/types';
import { checkpointCopy } from './copy';
import './styles.css';

const kinds = ['lines', 'dots', 'grid', 'hatch', 'shapes', 'motif'] as const;
const bounds = { spacing: [8, 64], angle: [0, 180], size: [2, 24], weight: [1, 6] } as const;
type Tile = {
  kind: (typeof kinds)[number];
  spacing: number;
  angle: number;
  size: number;
  weight: number;
  color: string;
  motif: string;
};
const defaults: Tile = {
  kind: 'lines',
  spacing: 24,
  angle: 30,
  size: 7,
  weight: 2,
  color: '#316783',
  motif: '',
};
const control = (key: string) => 'pattern.review.' + key;

function TilePreview(props: { tile: Tile; mono: boolean; label: string }) {
  const id = createUniqueId();
  const p = () => props.tile;
  const ink = () => (props.mono ? 'currentColor' : p().color);
  const path = () =>
    ({
      lines: 'M0 0H64',
      grid: 'M0 0H64 M0 0V64',
      hatch: 'M0 0L64 64 M0 64L64 0',
      dots: '',
      shapes: '',
      motif: '',
    })[p().kind];
  return (
    <svg viewBox="0 0 320 100" class="checkpoint-map" role="img" aria-label={props.label}>
      <defs>
        <pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width={p().spacing}
          height={p().spacing}
          patternTransform={`rotate(${p().angle})`}
        >
          <Show
            when={p().kind === 'hatch'}
            fallback={<path d={path()} stroke={ink()} stroke-width={p().weight} />}
          >
            <path
              d={`M0 0l${p().spacing} ${p().spacing} M0 ${p().spacing}l${p().spacing} -${p().spacing}`}
              stroke={ink()}
              stroke-width={p().weight}
            />
          </Show>
          <Show when={p().kind === 'dots'}>
            <circle cx={p().spacing / 2} cy={p().spacing / 2} r={p().size / 2} fill={ink()} />
          </Show>
          <Show when={p().kind === 'shapes'}>
            <rect
              x="2"
              y="2"
              width={p().size}
              height={p().size}
              fill="none"
              stroke={ink()}
              stroke-width={p().weight}
            />
          </Show>
          <Show when={p().kind === 'motif'}>
            <text x="2" y={p().size} font-size={String(p().size)} fill={ink()}>
              {p().motif}
            </text>
          </Show>
        </pattern>
      </defs>
      <rect width="320" height="100" fill={`url(#${id})`} />
    </svg>
  );
}

export function PatternReview(props: { language: Language; library?: boolean }) {
  const c = () => checkpointCopy[props.language];
  const [tile, setTile] = createSignal(defaults);
  const [mono, setMono] = createSignal(false);
  const [name, setName] = createSignal('');
  const [selected, setSelected] = createSignal('');
  const [presets, setPresets] = createSignal<
    { id: string; name: string; version: number; tile: Tile }[]
  >([]);
  const [applied, setApplied] = createSignal<{ tile: Tile; mono: boolean }>();
  const valid = () => tile().kind !== 'motif' || !!tile().motif.trim();

  function save() {
    const title = name().trim();
    if (!valid() || !title) return;
    const id = crypto.randomUUID();
    const version = 1 + presets().filter((entry) => entry.name === title).length;
    setPresets((previous) => [...previous, { id, name: title, version, tile: tile() }]);
    setSelected(id);
  }
  return (
    <section class="project-pane review-pattern">
      <h3>{c().patterns}</h3>
      <p class="review-note">{props.library ? c().personal : c().transient}</p>
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
              const next = presets().find((entry) => entry.id === e.currentTarget.value);
              setSelected(next?.id ?? '');
              if (next) {
                setTile(next.tile);
                setName(next.name);
              }
            }}
          >
            <option value="">{presets().length ? '—' : c().empty}</option>
            <For each={presets()}>
              {(entry) => (
                <option value={entry.id}>
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
          disabled={!valid() || !name().trim()}
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
