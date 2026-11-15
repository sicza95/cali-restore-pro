import { For, Show } from 'solid-js';
import type { SavedProject } from '../../platform/projects/types';
import { Icon } from '../icon/Icon';
import type { Language } from '../account-access/types';
import { projectCopy } from './project-copy';
import { followLink, projectHref } from '../router/routes';

export function ProjectRegister(props: {
  projects: SavedProject[];
  language: Language;
  showStart: boolean;
  status: (project: SavedProject) => string;
  navigate: (href: string) => void;
}) {
  const c = () => projectCopy[props.language];
  return (
    <ul class="project-register">
      <For
        each={props.projects}
        fallback={
          <li class="project-empty">
            <Icon name="folder" size={28} />
            <div>
              <strong>{props.showStart ? c().noProjects : c().empty}</strong>
              <Show when={props.showStart}>
                <p>{c().createHint}</p>
              </Show>
            </div>
          </li>
        }
      >
        {(project) => (
          <li>
            <a
              data-control-id="projects.open"
              href={projectHref(project.id)}
              onClick={(event) => followLink(event, props.navigate)}
            >
              <Icon name="folder" size={23} />
              <strong>{project.name}</strong>
              <Icon name="chevron" size={16} class="project-open-arrow" />
            </a>
            <span class="project-counts">
              {c().objectCounts(
                project.objects.length,
                project.objects.reduce((sum, object) => sum + object.surfaces.length, 0),
              )}
            </span>
            <small>{props.status(project)}</small>
            <time dateTime={new Date(project.updatedAt).toISOString()}>
              {new Intl.DateTimeFormat(props.language, { dateStyle: 'medium' }).format(
                project.updatedAt,
              )}
            </time>
          </li>
        )}
      </For>
    </ul>
  );
}
