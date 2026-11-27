import { For } from 'solid-js';

/** Native mutually exclusive radios presented as one joined row of buttons. */
export function ChoiceButtons<T extends string>(props: {
  name: string;
  label: string;
  options: readonly T[];
  value: T;
  text: (value: T) => string;
  control: (value: T) => string;
  pick: (value: T) => void;
}) {
  return (
    <div class="settings-choices" role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <label>
            <input
              type="radio"
              name={props.name}
              value={option}
              checked={props.value === option}
              data-control-id={props.control(option)}
              onChange={() => props.pick(option)}
            />
            <span>{props.text(option)}</span>
          </label>
        )}
      </For>
    </div>
  );
}
