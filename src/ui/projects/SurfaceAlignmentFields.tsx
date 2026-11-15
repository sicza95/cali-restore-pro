import { Show } from 'solid-js';
import { GuideFields } from './SurfaceReviewGuides';
import type { SurfaceCopy } from './surface-copy';
import type { surfaceMatcher } from './surface-match';
import type { SurfaceDraft } from './surface-review-model';

const id = (key: string) => 'surface.review.' + key;

export function SurfaceAlignmentFields(props: {
  copy: SurfaceCopy;
  photo?: string;
  reference?: string;
  busy: boolean;
  draft: SurfaceDraft;
  compare: boolean;
  matcher: ReturnType<typeof surfaceMatcher>;
  setCompare: (value: boolean) => void;
  setDraft: (value: SurfaceDraft) => void;
  setAutomatic: (value: boolean) => void;
}) {
  return (
    <>
      <button
        class="secondary"
        type="button"
        disabled={props.busy || props.draft.referenceOnly || props.matcher.status() === 'matching'}
        onClick={() => {
          const { draft, setDraft, setAutomatic, setCompare } = props;
          void props.matcher.start(props.photo!, props.reference!, ([pairOne, pairTwo]) => {
            setDraft({ ...draft, pairOne, pairTwo, manualPairs: true });
            setAutomatic(true);
            setCompare(true);
          });
        }}
        data-control-id={id('auto')}
        aria-describedby="surface-auto-help"
      >
        {props.copy.auto}
      </button>
      <p id="surface-auto-help" role="status">
        {props.copy[props.matcher.status() ?? 'autoUnavailable']}
      </p>
      <Show when={props.matcher.status() === 'matching'}>
        <button
          class="secondary"
          type="button"
          data-control-id={id('stopMatch')}
          onClick={() => props.matcher.cancel()}
        >
          {props.copy.stopMatch}
        </button>
      </Show>
      <label>
        <input
          data-control-id={id('compare')}
          type="checkbox"
          checked={props.compare}
          onChange={(e) => props.setCompare(e.currentTarget.checked)}
        />
        {props.copy.compare}
      </label>
      <label>
        <input
          data-control-id={id('referenceOnly')}
          type="checkbox"
          checked={props.draft.referenceOnly}
          onChange={(e) => {
            props.matcher.cancel();
            props.setDraft({ ...props.draft, referenceOnly: e.currentTarget.checked });
          }}
        />
        {props.copy.referenceOnly}
      </label>
      <Show when={!props.draft.referenceOnly}>
        <label>
          <input
            data-control-id={id('manualPairs')}
            type="checkbox"
            checked={props.draft.manualPairs}
            aria-describedby="surface-pair-help"
            onChange={(e) => {
              const manualPairs = e.currentTarget.checked;
              props.setDraft({ ...props.draft, manualPairs });
              if (manualPairs) props.setCompare(true);
            }}
          />
          {props.copy.manualPairs}
        </label>
        <p id="surface-pair-help">{props.copy.pairHelp}</p>
        <Show when={props.draft.manualPairs}>
          <GuideFields
            copy={props.copy}
            draft={props.draft}
            change={(value) => {
              props.setAutomatic(false);
              props.setDraft(value);
            }}
            pairs
          />
        </Show>
      </Show>
    </>
  );
}
