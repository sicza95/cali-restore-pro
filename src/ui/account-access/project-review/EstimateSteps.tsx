import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { EstimateCopy } from '../../../platform/estimates/copy';
import { stepControl } from './estimate-controls';

export const estimateSteps = ['objects', 'phases', 'extras', 'adjustments', 'issue'] as const;
export type EstimateStep = (typeof estimateSteps)[number];

export const stepName = (copy: EstimateCopy, step: EstimateStep) =>
  ({
    objects: copy.stepObjects,
    phases: copy.phases,
    extras: copy.extras,
    adjustments: copy.adjustments,
    issue: copy.stepIssue,
  })[step];

const panelId = (step: EstimateStep) => 'estimate-step-' + step;

/** The five steps as an ordered list; each shows where it stands and whether it blocks saving. */
export function EstimateStepNav(props: {
  copy: EstimateCopy;
  current: EstimateStep;
  state: (step: EstimateStep) => string;
  incomplete: (step: EstimateStep) => boolean;
  go: (step: EstimateStep) => void;
}) {
  const c = () => props.copy;
  return (
    <nav class="estimate-steps" aria-label={c().steps}>
      <ol>
        <For each={estimateSteps}>
          {(step, index) => (
            <li>
              <button
                type="button"
                class="secondary"
                data-control-id={stepControl(step)}
                aria-current={props.current === step ? 'step' : undefined}
                aria-controls={panelId(step)}
                onClick={() => props.go(step)}
              >
                <span class="estimate-step-number" aria-hidden="true">
                  {index() + 1}
                </span>
                <span class="estimate-step-name">{stepName(c(), step)}</span>
                <small classList={{ 'estimate-step-incomplete': props.incomplete(step) }}>
                  {props.incomplete(step) ? c().incomplete : props.state(step)}
                </small>
              </button>
            </li>
          )}
        </For>
      </ol>
    </nav>
  );
}

/** One step's content. Stays mounted while hidden, so drafts survive switching steps. */
export function EstimateStepPanel(props: {
  copy: EstimateCopy;
  step: EstimateStep;
  current: EstimateStep;
  go: (step: EstimateStep) => void;
  children: JSX.Element;
  /** The step's own primary action; otherwise "Next" is the primary. */
  primary?: JSX.Element;
}) {
  const c = () => props.copy;
  const index = () => estimateSteps.indexOf(props.step);
  const previous = () => estimateSteps[index() - 1];
  const next = () => estimateSteps[index() + 1];
  return (
    <div
      id={panelId(props.step)}
      class="review-flow estimate-step"
      role="region"
      aria-label={stepName(c(), props.step)}
      tabindex="-1"
      hidden={props.current !== props.step}
    >
      {props.children}
      <div class="review-actions estimate-step-actions">
        <Show when={previous()}>
          {(step) => (
            <button
              type="button"
              class="secondary"
              data-control-id={stepControl('back')}
              onClick={() => props.go(step())}
            >
              {c().back}
            </button>
          )}
        </Show>
        <Show when={next()} fallback={props.primary}>
          {(step) => (
            <button
              type="button"
              data-control-id={stepControl('next')}
              onClick={() => props.go(step())}
            >
              {c().next(stepName(c(), step()))}
            </button>
          )}
        </Show>
      </div>
    </div>
  );
}

/** Show a step and move focus to it, so screen readers announce the new step. */
export function focusStep(step: EstimateStep) {
  document.getElementById(panelId(step))?.focus();
}
