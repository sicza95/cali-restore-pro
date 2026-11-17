import { Show } from 'solid-js';
import type { SavedProject } from '../../platform/projects/types';
import type { Language } from '../account-access/types';
import type { ReviewRoute } from '../reports/report-controls';
import { ProjectReviewLinks } from './ProjectReviewLinks';
import { EstimateReview } from '../estimates/EstimateReview';
import { ReportReview } from '../reports/ReportReview';
import './styles.css';
import type { LocalVault } from '../../platform/vault/vault';

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
