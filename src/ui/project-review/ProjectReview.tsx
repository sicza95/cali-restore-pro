import { For, Show } from 'solid-js';
import type { SavedProject } from '../../platform/projects/types';
import type { Language } from '../account-access/types';
import { followProjectLink, projectReviewHref } from '../projects/project-route';
import { estimateCopy } from '../../platform/estimates/copy';
import { reviewRoutes, routeControl } from '../reports/report-controls';
import type { ReviewRoute } from '../reports/report-controls';
import { EstimateReview } from '../estimates/EstimateReview';
import { ReportReview } from '../reports/ReportReview';
import './styles.css';
import type { LocalVault } from '../../platform/vault/vault';

export function ProjectReviewLinks(props: {
  project: string;
  language: Language;
  active?: ReviewRoute;
  navigate: (href: string) => void;
}) {
  const c = () => estimateCopy[props.language];
  return (
    <nav class="project-review-nav" aria-label={c().routeNav}>
      <For each={reviewRoutes}>
        {(key) => (
          <a
            class="project-back"
            data-control-id={routeControl(key)}
            aria-current={props.active === key ? 'page' : undefined}
            href={projectReviewHref(props.project, key)}
            onClick={(event) => followProjectLink(event, props.navigate)}
          >
            {c()[key]}
          </a>
        )}
      </For>
    </nav>
  );
}

export function ProjectReview(props: {
  vault: LocalVault;
  project: SavedProject;
  language: Language;
  account: string;
  route: ReviewRoute;
  navigate: (href: string) => void;
}) {
  return (
    <div class="review-flow project-review">
      <header>
        <ProjectReviewLinks
          project={props.project.id}
          language={props.language}
          active={props.route}
          navigate={props.navigate}
        />
      </header>
      <Show
        when={props.route === 'estimates'}
        fallback={
          <ReportReview
            vault={props.vault}
            project={props.project}
            language={props.language}
            account={props.account}
            output={props.route === 'outputs'}
          />
        }
      >
        <EstimateReview
          vault={props.vault}
          project={props.project}
          language={props.language}
          navigate={props.navigate}
        />
      </Show>
    </div>
  );
}
