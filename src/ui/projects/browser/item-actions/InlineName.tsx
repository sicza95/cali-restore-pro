import { createSignal, createEffect, Show } from 'solid-js';
import type { Language } from '../../../../platform/i18n/language';
import { itemActionCopy } from './copy';

export function InlineName(props: {
  name: string;
  language: Language;
  editing?: boolean;
  onSave?: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let input!: HTMLInputElement;
  let cancelled = false;
  createEffect(() => {
    if (props.editing)
      queueMicrotask(() => {
        setName(props.name);
        setError('');
        cancelled = false;
        input?.focus();
        input?.select();
      });
  });
  async function submit() {
    if (busy() || cancelled) return;
    const value = name().trim();
    if (!value || value.length > 120) {
      setError(itemActionCopy[props.language].invalid);
      return;
    }
    if (value === props.name) {
      props.onCancel?.();
      return;
    }
    setBusy(true);
    try {
      await props.onSave?.(value);
    } catch {
      setError(itemActionCopy[props.language].failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Show
      when={props.editing}
      fallback={
        <strong class="browser-item-name" title={props.name}>
          {props.name}
        </strong>
      }
    >
      <div
        class="browser-inline-name"
        onClick={(event) => event.stopPropagation()}
        onDblClick={(event) => event.stopPropagation()}
      >
        <input
          ref={(element) => (input = element)}
          aria-label={itemActionCopy[props.language].rename}
          value={name()}
          maxlength={120}
          readOnly={busy()}
          aria-invalid={!!error()}
          data-control-id="browser.rename.input"
          onInput={(event) => setName(event.currentTarget.value)}
          onBlur={() => void submit()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelled = true;
              props.onCancel?.();
            }
          }}
        />
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
      </div>
    </Show>
  );
}
