import { Show, untrack } from 'solid-js';
import type { EstimateCopy } from '../../platform/estimates/copy';
import type { Language } from '../account-access/types';
import { financeControl as id } from './estimate-controls';
import { EstimateVersion } from './EstimateVersion';
import { ReviewSelect } from '../project-review/fields';
import type { EstimateDraft } from './useEstimateDraft';

/** Last step: assumptions, what still blocks saving, and the saved versions. */
export function EstimateIssue(props: {
  copy: EstimateCopy;
  language: Language;
  draft: EstimateDraft;
}) {
  const c = () => props.copy;
  const d = untrack(() => props.draft);
  return (
    <section class="project-pane">
      <h2>{c().stepIssue}</h2>
      <label>
        {c().assumptions}
        <textarea
          data-control-id={id('assumptions')}
          maxlength="1000"
          value={d.assumptions()}
          onInput={(e) => d.setAssumptions(e.currentTarget.value)}
        />
      </label>
      <Show when={!d.valid()}>
        <p>{c().validation}</p>
      </Show>
      <Show when={d.versions().length} fallback={<p>{c().noSnapshot}</p>}>
        <ReviewSelect
          id={id('version')}
          label={c().version}
          options={d.versions().map((_, index) => String(index + 1))}
          value={d.version()}
          change={d.setVersion}
        />
        <Show when={d.versions()[Number(d.version()) - 1]}>
          {(saved) => <EstimateVersion language={props.language} saved={saved()} />}
        </Show>
      </Show>
    </section>
  );
}

/** The step's actions: saving a version is the primary, issuing is secondary. */
export function EstimateIssueActions(props: { copy: EstimateCopy; draft: EstimateDraft }) {
  const d = untrack(() => props.draft);
  return (
    <>
      <button
        class="primary"
        type="button"
        data-control-id={id('snapshot')}
        disabled={!d.valid()}
        onClick={() => void d.capture()}
      >
        {props.copy.snapshot}
      </button>
      <button
        type="button"
        class="secondary"
        data-control-id={id('issue')}
        disabled={!d.valid() || !d.result()?.complete}
        onClick={() => void d.capture(true)}
      >
        {props.copy.issue}
      </button>
    </>
  );
}
