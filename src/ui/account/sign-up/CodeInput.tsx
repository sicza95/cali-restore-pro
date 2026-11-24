import { createSignal, Index, onMount } from 'solid-js';
import type { Translate } from '../../account-access/types';

export const codeLength = 6;

/**
 * One box per digit. Typing a digit moves to the next box and selects it; Backspace on an empty
 * box goes back; pasting (or one-time-code autofill) spreads the digits. The last digit calls
 * `complete`, so no submit button is needed.
 */
export function CodeInput(props: {
  t: Translate;
  disabled: boolean;
  invalid: boolean;
  controlId: string;
  complete: (code: string) => void;
  ref?: (api: { clear: () => void }) => void;
}) {
  const boxes: HTMLInputElement[] = [];
  const [digits, setDigits] = createSignal<string[]>(Array<string>(codeLength).fill(''));
  const focus = (index: number) => {
    const box = boxes[Math.max(0, Math.min(codeLength - 1, index))];
    box?.focus();
    box?.select();
  };
  /** Writes digits from `start` on, then moves on, or reports the full code. */
  const fill = (start: number, incoming: string) => {
    const next = [...digits()];
    incoming
      .slice(0, codeLength - start)
      .split('')
      .forEach((digit, offset) => (next[start + offset] = digit));
    setDigits(next);
    if (next.every((digit) => digit !== '')) {
      boxes[codeLength - 1]?.blur();
      props.complete(next.join(''));
    } else focus(start + incoming.length);
  };
  onMount(() => {
    props.ref?.({
      clear: () => {
        setDigits(Array<string>(codeLength).fill(''));
        queueMicrotask(() => focus(0));
      },
    });
    focus(0);
  });
  return (
    <fieldset class="sign-up-code" aria-invalid={props.invalid || undefined}>
      <legend>{props.t('codeLabel')}</legend>
      <div class="sign-up-code-boxes">
        <Index each={digits()}>
          {(digit, index) => (
            <input
              ref={(el) => (boxes[index] = el)}
              type="text"
              inputmode="numeric"
              autocomplete={index === 0 ? 'one-time-code' : 'off'}
              aria-label={`${props.t('codeDigit')} ${index + 1} / ${codeLength}`}
              data-control-id={props.controlId}
              value={digit()}
              disabled={props.disabled}
              onFocus={(event) => event.currentTarget.select()}
              onInput={(event) => {
                const typed = event.currentTarget.value.replace(/\D/g, '');
                const previous = digit();
                if (!typed) {
                  event.currentTarget.value = '';
                  const next = [...digits()];
                  next[index] = '';
                  setDigits(next);
                  return;
                }
                // A caret after the old digit gives "old+new": keep the new one. Several new
                // digits at once come from autofill or a paste-like insert: spread them.
                const single = typed.length === 2 && typed[0] === previous;
                event.currentTarget.value = previous;
                fill(index, single ? typed[1]! : typed);
              }}
              onPaste={(event) => {
                event.preventDefault();
                const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
                if (pasted) fill(index, pasted);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && !event.currentTarget.value && index > 0) {
                  event.preventDefault();
                  const next = [...digits()];
                  next[index - 1] = '';
                  setDigits(next);
                  focus(index - 1);
                } else if (event.key === 'ArrowLeft') focus(index - 1);
                else if (event.key === 'ArrowRight') focus(index + 1);
              }}
            />
          )}
        </Index>
      </div>
    </fieldset>
  );
}
