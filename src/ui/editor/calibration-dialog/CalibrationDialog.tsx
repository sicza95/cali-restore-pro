import { createSignal, createUniqueId, onCleanup, onMount } from 'solid-js';
import { Button } from '../../controls/button/Button';
import { IconButton } from '../../controls/icon-button/IconButton';
import { Field } from '../../controls/field/Field';
import { isPositiveLength } from './utils';
import type { CalibrationDialogProps } from './types';

/** Presentation-only form. The caller owns persistence and measurement changes. */
export function CalibrationDialog(props: CalibrationDialogProps) {
  let dialog: HTMLDialogElement | undefined;
  const id = createUniqueId();
  const [width, setWidth] = createSignal('300');
  const [height, setHeight] = createSignal('200');
  const [submitted, setSubmitted] = createSignal(false);
  const error = (value: string) =>
    submitted() && !isPositiveLength(value) ? 'Enter a positive length.' : undefined;

  onMount(() => {
    if (!dialog) return;
    const element = dialog;
    const returnFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    onCleanup(() => {
      element.close();
      returnFocus?.focus();
    });
  });

  return (
    <dialog
      ref={(element) => {
        dialog = element;
      }}
      class="cr-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (isPositiveLength(width()) && isPositiveLength(height()))
            props.onApply({ widthCm: Number(width()), heightCm: Number(height()) });
          else dialog?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
        }}
      >
        <div class="cr-dialog-heading">
          <div>
            <span class="cr-overline">North wall</span>
            <h2 id={`${id}-title`}>Calibration & units</h2>
          </div>
          <IconButton
            icon="close"
            variant="ghost"
            label="Close calibration"
            onClick={props.onClose}
          />
        </div>
        <p>Enter the dimensions of the assessed plane.</p>
        <div class="cr-field-pair">
          <Field
            label="Width"
            value={width()}
            onInput={setWidth}
            inputMode="decimal"
            suffix="cm"
            error={error(width())}
          />
          <Field
            label="Height"
            value={height()}
            onInput={setHeight}
            inputMode="decimal"
            suffix="cm"
            error={error(height())}
          />
        </div>
        <div class="cr-form-summary">
          <span>Plane area</span>
          <output>
            {isPositiveLength(width()) && isPositiveLength(height())
              ? `${((Number(width()) * Number(height())) / 10000).toFixed(2)} m²`
              : '—'}
          </output>
        </div>
        <p class="cr-note">Display units do not change your geometry.</p>
        <div class="cr-dialog-actions">
          <Button onClick={props.onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Apply calibration
          </Button>
        </div>
      </form>
    </dialog>
  );
}
