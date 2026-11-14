import { createResource, For, Show } from 'solid-js';
import { patternKey, patternLibrary } from '../../../platform/projects/patterns';
import type { PatternVersion } from '../../../platform/projects/patterns';
import type { LocalVault } from '../../../platform/vault/vault';
import type { DrawingCopy } from './copy';
import { control } from './constants';

export function LayerPattern(props: {
  vault: LocalVault;
  value?: PatternVersion;
  copy: DrawingCopy;
  onValue: (value?: PatternVersion) => void;
}) {
  const [rows] = createResource(() => patternLibrary(props.vault).list());
  const selected = () => (props.value ? patternKey(props.value) : '');
  const versions = () => {
    const values = rows.error ? [] : (rows() ?? []);
    const current = props.value;
    return current && !values.some((entry) => patternKey(entry) === selected())
      ? [...values, current]
      : values;
  };
  return (
    <>
      <label>
        {props.copy.pattern}
        <select
          data-control-id={control('layer.pattern')}
          value={selected()}
          onChange={(event) => {
            const key = event.currentTarget.value;
            props.onValue(versions().find((entry) => patternKey(entry) === key));
          }}
        >
          <option value="" selected={!selected()}>
            {props.copy.noPattern}
          </option>
          <For each={versions()}>
            {(entry) => (
              <option value={patternKey(entry)} selected={selected() === patternKey(entry)}>
                {entry.name} · v{entry.version}
              </option>
            )}
          </For>
        </select>
      </label>
      <Show when={rows.error}>
        <p role="status">{props.copy.patternFailed}</p>
      </Show>
    </>
  );
}
