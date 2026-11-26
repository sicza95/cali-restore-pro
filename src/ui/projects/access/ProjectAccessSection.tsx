import { createSignal, Show } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { projectSnapshot } from '../../../platform/projects/shared-project';
import { ProjectSharingControls } from '../../sharing/ProjectSharingControls';
import { accessCopy } from './copy';
import { useAccessVault } from './ProjectAccessProvider';
import { VisibilityControl } from './VisibilityControl';
import type { ProjectAccessSectionProps } from './types';
import './styles.css';

export function ProjectAccessSection(props: ProjectAccessSectionProps) {
  const app = useApp();
  const vault = useAccessVault();
  const c = () => accessCopy[app.lang()];
  return (
    <section class="project-access-section" aria-label={c().access}>
      <h2>{c().access}</h2>
      <Show
        when={
          props.hosted &&
          props.canManage &&
          props.account &&
          props.account.id === app.account()?.id &&
          props.project.id
        }
        keyed
        fallback={
          <>
            <label>
              {c().visibility}
              <select
                data-control-id="project.access.visibility"
                disabled
                aria-describedby="project-access-reason"
              >
                <option>{props.hosted ? c().managedByOwners : c().private}</option>
              </select>
            </label>
            <p id="project-access-reason">{props.hosted ? c().ownerOnly : c().localOnly}</p>
          </>
        }
      >
        {(id) => {
          const [left, setLeft] = createSignal(false);
          return (
            <Show when={!left()} fallback={<p>{c().ownerOnly}</p>}>
              <VisibilityControl project={id} name={props.project.name} />
              <h3>{c().members}</h3>
              <Show when={vault?.()} fallback={<p>{c().unavailable}</p>}>
                {(local) => (
                  <div class="project-access-members">
                    <ProjectSharingControls
                      compact
                      projectPath={'/hosted-projects/' + encodeURIComponent(id)}
                      path={'/hosted-projects/' + encodeURIComponent(id) + '/invitations'}
                      projectId={id}
                      project={projectSnapshot(props.project)}
                      originalIds={[
                        ...new Set(
                          props.project.objects.flatMap((object) =>
                            object.surfaces.flatMap((surface) =>
                              surface.images.map((image) => image.id),
                            ),
                          ),
                        ),
                      ]}
                      canHost
                      organisation={props.project.organisation}
                      vault={local()}
                      onLeave={() => {
                        setLeft(true);
                        props.onOpenProject?.();
                      }}
                    />
                  </div>
                )}
              </Show>
            </Show>
          );
        }}
      </Show>
    </section>
  );
}
