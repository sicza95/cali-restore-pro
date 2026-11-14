import { createMemo, createSignal, For, Show, untrack } from 'solid-js';
import { control, masterId } from './constants';
import type { DrawingCopy } from './copy';
import type { DrawingReview } from './createDrawingReview';
import { DrawNumber, DrawToggle } from './DrawingFields';
import { Icon } from '../../icon/Icon';
import { LayerPattern } from './LayerPattern';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Layer, LayerKind } from './types';

export const layerName = (layer: Pick<Layer, 'name' | 'kind'>, copy: DrawingCopy) =>
  layer.name || copy[layer.kind];

export function DrawingLayers(props: {
  model: DrawingReview;
  copy: DrawingCopy;
  vault: LocalVault;
}) {
  const m = untrack(() => props.model);
  const c = () => props.copy;
  const [kind, setKind] = createSignal<LayerKind>('damage');
  const layer = m.layer;
  const visibleRows = createMemo(() => {
    const append = (parent: number, depth: number): { id: number; depth: number }[] =>
      m
        .layers()
        .filter((item) => item.parent === parent)
        .flatMap((item) => [
          { id: item.id, depth },
          ...(item.kind === 'folder' && item.expanded ? append(item.id, depth + 1) : []),
        ]);
    return append(0, 0);
  });
  const cannotDelete = () =>
    layer().id === masterId || m.layers().some((item) => item.parent === layer().id);
  return (
    <section class="drawing-panel" aria-label={c().layers}>
      <h3>{c().layers}</h3>
      <ul class="drawing-layers">
        <For each={visibleRows().map(({ id }) => id)}>
          {(id) => {
            const row = () => m.layers().find((item) => item.id === id)!;
            const name = () => layerName(row(), c());
            const pending = () => m.drafts()[id]?.pending.length ?? 0;
            const undone = () => m.drafts()[id]?.undone.length ?? 0;
            return (
              <li
                style={{ '--drawing-depth': visibleRows().find((item) => item.id === id)?.depth }}
              >
                <button
                  class="secondary drawing-layer-select"
                  type="button"
                  data-control-id={control('layer.select')}
                  aria-pressed={m.selected() === id}
                  onClick={() => m.select(id)}
                >
                  <strong>{name()}</strong>
                  <small>
                    <Show when={row().name}>{c()[row().kind]} · </Show>
                    {row().kind === 'folder'
                      ? m.layers().filter((item) => item.parent === id).length
                      : row().marks.length}
                    {' · '}
                    {row().kind === 'folder' ? c().layers : c().mark}
                    <Show when={pending()}>
                      {' '}
                      · {c().pending} {pending()}
                    </Show>
                    <Show when={undone()}>
                      {' '}
                      · {c().undone} {undone()}
                    </Show>
                  </small>
                </button>
                <Show
                  when={row().kind === 'folder'}
                  fallback={
                    <button
                      class="secondary drawing-icon"
                      data-control-id={control('layer.visibility')}
                      type="button"
                      aria-label={name() + ' · ' + c().visibility}
                      aria-pressed={row().visible}
                      title={c().visibility}
                      onClick={() => m.update(id, { visible: !row().visible })}
                    >
                      <Icon name={row().visible ? 'eye' : 'eyeOff'} size={18} />
                    </button>
                  }
                >
                  <button
                    class="secondary drawing-icon"
                    type="button"
                    data-control-id={control('layer.expand')}
                    aria-label={name() + ' · ' + (row().expanded ? c().collapse : c().expand)}
                    aria-expanded={row().expanded}
                    title={row().expanded ? c().collapse : c().expand}
                    onClick={() => {
                      if (row().expanded) {
                        let item = layer();
                        while (item.parent) {
                          if (item.parent === id) {
                            m.select(id);
                            break;
                          }
                          item = m.layers().find((ancestor) => ancestor.id === item.parent)!;
                        }
                      }
                      m.update(id, { expanded: !row().expanded });
                    }}
                  >
                    <Icon name={row().expanded ? 'minus' : 'plus'} size={18} />
                  </button>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
      <div class="drawing-actions drawing-add">
        <label>
          {c().kind}
          <select
            data-control-id={control('layer.kind')}
            value={kind()}
            onChange={(e) => setKind(e.currentTarget.value as LayerKind)}
          >
            <option value="damage">{c().damage}</option>
            <option value="phase">{c().phase}</option>
            <option value="folder">{c().folder}</option>
          </select>
        </label>
        <button
          class="secondary"
          type="button"
          data-control-id={control('layer.add')}
          onClick={() => m.add(kind())}
        >
          {c().addLayer}
        </button>
      </div>
      <details>
        <summary data-control-id={control('layer.properties')}>{c().properties}</summary>
        <Show when={layer().id} keyed>
          {(id) => (
            <div class="drawing-properties">
              <form
                class="drawing-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
                  m.update(id, { name });
                }}
              >
                <label>
                  {c().name}
                  <input
                    name="name"
                    maxlength="80"
                    data-control-id={control('layer.name')}
                    value={layerName(layer(), c())}
                  />
                </label>
                <button class="secondary" type="submit" data-control-id={control('layer.rename')}>
                  {c().rename}
                </button>
              </form>
              <Show when={id !== masterId}>
                <label>
                  {c().parent}
                  <select
                    data-control-id={control('layer.parent')}
                    value={String(layer().parent)}
                    onChange={(e) => {
                      const parent = Number(e.currentTarget.value);
                      void m.update(id, { parent });
                    }}
                  >
                    <option value="0">{c().root}</option>
                    <For each={m.parentChoices()}>
                      {(folder) => <option value={folder.id}>{layerName(folder, c())}</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <Show when={layer().kind !== 'folder'}>
                <DrawToggle
                  name="layer.locked"
                  label={c().locked}
                  checked={layer().locked}
                  onValue={(locked) => m.update(id, { locked })}
                />
                <div class="drawing-fields">
                  <DrawNumber
                    name="layer.opacity"
                    label={c().opacity}
                    value={layer().opacity}
                    onValue={(opacity) => m.update(id, { opacity })}
                  />
                  <label>
                    {c().color}
                    <input
                      type="color"
                      data-control-id={control('layer.color')}
                      value={layer().color}
                      onChange={(e) => m.update(id, { color: e.currentTarget.value })}
                    />
                  </label>
                  <label>
                    {c().fill}
                    <select
                      data-control-id={control('layer.fill')}
                      value={layer().fill}
                      onChange={(e) =>
                        m.update(id, { fill: e.currentTarget.value as Layer['fill'] })
                      }
                    >
                      <option value="solid">{c().solid}</option>
                      <option value="hatch">{c().hatch}</option>
                      <option value="none">{c().none}</option>
                    </select>
                  </label>
                  <LayerPattern
                    vault={props.vault}
                    value={layer().pattern}
                    copy={c()}
                    onValue={(pattern) =>
                      m.update(id, pattern ? { pattern, fill: 'hatch' } : { pattern })
                    }
                  />
                  <DrawToggle
                    name="layer.outline"
                    label={c().outline}
                    checked={layer().outline}
                    onValue={(outline) => m.update(id, { outline })}
                  />
                </div>
              </Show>
              <div class="drawing-actions">
                <Show when={layer().kind === 'damage' || layer().kind === 'phase'}>
                  <button
                    class="secondary"
                    type="button"
                    data-control-id={control('layer.clone')}
                    onClick={() => m.add(layer().kind, layer())}
                  >
                    {c().clone}
                  </button>
                </Show>
                <button
                  class="secondary"
                  type="button"
                  data-control-id={control('layer.up')}
                  disabled={!m.neighbor(-1)}
                  onClick={() => m.move(-1)}
                >
                  {c().up}
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-control-id={control('layer.down')}
                  disabled={!m.neighbor(1)}
                  onClick={() => m.move(1)}
                >
                  {c().down}
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-control-id={control('layer.remove')}
                  disabled={cannotDelete() || !!m.draft()}
                  title={cannotDelete() ? c().removeHelp : m.draft() ? c().removeDraft : undefined}
                  onClick={m.remove}
                >
                  {c().remove}
                </button>
              </div>
            </div>
          )}
        </Show>
      </details>
    </section>
  );
}
