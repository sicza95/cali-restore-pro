import { For, Show } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import type { Language } from '../types';
import { followProjectLink, projectHref, projectReviewHref } from '../projects/project-route';
import { projectCopy } from '../projects/project-copy';
import { estimateCopy } from './estimate-copy';
import { reviewRoutes, routeControl } from './report-controls';
import type { ReviewRoute } from './report-controls';
import { EstimateReview } from './EstimateReview';
import { ReportReview } from './ReportReview';
import './styles.css';
import type { LocalVault } from '../../../platform/vault/vault';

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
  const c = () => estimateCopy[props.language];
  return (
    <div class="review-flow project-review">
      <nav class="review-breadcrumbs" aria-label={projectCopy[props.language].hierarchy}>
        <a
          class="project-back"
          data-control-id="project.library"
          href="/projects"
          onClick={(event) => followProjectLink(event, props.navigate)}
        >
          {projectCopy[props.language].back}
        </a>
        <a
          class="project-back"
          data-control-id="project.review.parent"
          href={projectHref(props.project.id)}
          onClick={(event) => followProjectLink(event, props.navigate)}
        >
          {props.project.name}
        </a>
      </nav>
      <header>
        <h2>{c()[props.route]}</h2>
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
