import { createSignal, Show, untrack } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import type { LocalVault } from '../../platform/vault/vault';
import type { SharedProject } from '../../platform/projects/shared-project';
import { invitationCopy } from './copy';
import { ProjectSharingControls } from './ProjectSharingControls';
import './styles.css';

export function ProjectInvitations(props: {
  projectId: string;
  project: SharedProject;
  originalIds?: string[];
  canHost?: boolean;
  /** The organisation the project is hosted in; none means the personal one. */
  organisation?: string;
  onLeave?: () => void;
  onHosted?: () => Promise<void>;
  vault: LocalVault;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  // The parent keys this panel by project ID, so the path is fixed for this mount.
  const projectPath = '/hosted-projects/' + untrack(() => props.projectId);
  const path = projectPath + '/invitations';
  const [open, setOpen] = createSignal(false);
  return (
    <details class="invitation-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary data-control-id="project.collaboration">{c().heading}</summary>
      <Show when={open()}>
        <ProjectSharingControls
          path={path}
          projectPath={projectPath}
          projectId={props.projectId}
          project={props.project}
          originalIds={props.originalIds}
          vault={props.vault}
          canHost={props.canHost}
          organisation={props.organisation}
          onLeave={props.onLeave}
          onHosted={props.onHosted}
        />
      </Show>
    </details>
  );
}
