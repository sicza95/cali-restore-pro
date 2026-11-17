import { For } from 'solid-js';
import type { Language } from '../account-access/types';
import { followLink, projectReviewHref } from '../router/routes';
import { estimateCopy } from '../../platform/estimates/copy';
import { reviewRoutes, routeControl } from '../reports/report-controls';
import type { ReviewRoute } from '../reports/report-controls';

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
            onClick={(event) => followLink(event, props.navigate)}
          >
            {c()[key]}
          </a>
        )}
      </For>
    </nav>
  );
}
