import { Show } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
import { followLink, projectHref } from '../../router/routes';
import { accessCopy } from './copy';
import type { ProjectWideAccessNoteProps } from './types';
import './styles.css';

export function ProjectWideAccessNote(props: ProjectWideAccessNoteProps) {
  const app = useApp();
  const c = () => accessCopy[app.lang()];
  return (
    <section class="project-access-section" aria-label={c().projectWide}>
      <h2>{c().projectWide}</h2>
      <p>{c().inherited}</p>
      <Show when={!props.hosted}>
        <p>{c().localOnly}</p>
      </Show>
      <a
        data-control-id="project.access.open-project"
        href={projectHref(props.project.id)}
        onClick={(event) => {
          if (props.onOpenProject) followLink(event, () => props.onOpenProject?.());
        }}
      >
        {c().openProject} · {props.project.name}
      </a>
    </section>
  );
}
