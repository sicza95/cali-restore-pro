import { createSignal, For, Show, untrack } from 'solid-js';
import { useApp } from '../app-context/AppContext';
import type { LocalVault } from '../../platform/vault/vault';
import type { SharedProject } from '../../platform/projects/shared-project';
import { invitationCopy } from './copy';
import type { ProjectOwner, SentInvitation } from './types';
import { ownerInvitation, separateInvitations } from './roster';
import { useInvitations } from './useInvitations';
import { usePublishSharingKey } from './publish-sharing-key';
import { ProjectOwners } from './ProjectOwners';
import { ProjectInviteForm } from './ProjectInviteForm';
import { SentInvitationContent } from './SentInvitationContent';
import './styles.css';

export function ProjectSharingControls(props: {
  path: string;
  compact?: boolean;
  projectPath: string;
  projectId: string;
  project: SharedProject;
  originalIds?: string[];
  canHost?: boolean;
  organisation?: string;
  onLeave?: () => void;
  vault: LocalVault;
}) {
  const app = useApp();
  const c = () => invitationCopy[app.lang()];
  const sent = useInvitations<SentInvitation>(untrack(() => props.path));
  const [owners, setOwners] = createSignal<ProjectOwner[]>([]);
  const canPublishOriginals = () =>
    props.compact
      ? owners().some((owner) => owner.host && owner.id === app.account()?.id)
      : props.canHost;
  usePublishSharingKey(untrack(() => props.vault));
  return (
    <>
      <Show
        when={sent.failed() || (sent.error() && (sent.error() !== 'not_found' || !props.canHost))}
      >
        <p role="alert">
          {sent.failed() === 'too-large'
            ? c().scopeTooLarge
            : sent.failureCode() === 'not_permitted' &&
                sent.error() === 'not_found' &&
                props.canHost
              ? c().hostingRequired
              : sent.failureCode() === 'storage_quota_exceeded'
                ? c().hostingQuota
                : c().error}
        </p>
      </Show>
      <Show when={sent.loading()}>
        <p role="status">{c().loading}</p>
      </Show>
      <Show when={sent.error() === 'not_found' && props.canHost}>
        <p>{c().hostHelp}</p>
        <button
          disabled={sent.busy()}
          data-control-id="project.host"
          onClick={() =>
            void sent.run(() =>
              app.request(
                props.projectPath,
                props.organisation ? { organisation: props.organisation } : {},
                'PUT',
              ),
            )
          }
        >
          {c().enable}
        </button>
      </Show>
      <Show when={!sent.error() && !sent.loading()}>
        <ProjectOwners
          projectPath={props.projectPath}
          onOwners={setOwners}
          renderAccess={
            props.compact
              ? (owner) => {
                  const item = () => ownerInvitation(sent.rows(), owner);
                  return (
                    <Show when={item()}>
                      {(invitation) => (
                        <SentInvitationContent
                          {...props}
                          canHost={canPublishOriginals()}
                          item={invitation()}
                          identity={false}
                          sent={sent}
                        />
                      )}
                    </Show>
                  );
                }
              : undefined
          }
          onRemoved={(id) => {
            if (id === app.account()?.id && props.onLeave) props.onLeave();
            else void sent.refetch();
          }}
        />
        <ProjectInviteForm path={props.path} sent={sent} />
        <ul class="session-list">
          <For
            each={props.compact ? separateInvitations(sent.rows(), owners()) : sent.rows()}
            fallback={<li>{c().empty}</li>}
          >
            {(item) => (
              <li>
                <SentInvitationContent
                  {...props}
                  canHost={canPublishOriginals()}
                  item={item}
                  sent={sent}
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <button
        data-control-id="sharing.refresh"
        disabled={sent.loading() || sent.busy()}
        onClick={() => void sent.refetch()}
      >
        {c().refresh}
      </button>
    </>
  );
}
