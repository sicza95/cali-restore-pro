import type {
  SavedProject,
  Surface,
  RestorationObject,
  Attachment,
} from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { Language } from '../types';
import { ProjectOriginals } from './ProjectOriginals';
import { projectCopy } from './project-copy';
import { followProjectLink, projectHref } from './project-route';

export function SurfaceWorkspace(props: {
  project: SavedProject;
  object: RestorationObject;
  surface: Surface;
  vault: LocalVault;
  language: Language;
  busy: boolean;
  onRun: (task: () => Promise<void>) => Promise<boolean>;
  onSave: (project: SavedProject) => Promise<void>;
  onNavigate: (href: string) => void;
}) {
  const c = () => projectCopy[props.language];
  const href = () => projectHref(props.project.id);
  const saveImages = (images: Attachment[]) =>
    props.onSave({
      ...props.project,
      objects: props.project.objects.map((object) =>
        object.id === props.object.id
          ? {
              ...object,
              surfaces: object.surfaces.map((surface) =>
                surface.id === props.surface.id ? { ...surface, images } : surface,
              ),
            }
          : object,
      ),
    });
  return (
    <>
      <a
        class="project-back"
        data-control-id="surface.project"
        href={href()}
        onClick={(event) => followProjectLink(event, props.onNavigate)}
      >
        {props.project.name}
      </a>
      <p>{props.object.name}</p>
      <h2>{props.surface.name}</h2>
      <p>{c().editorUnavailable}</p>
      <ProjectOriginals
        project={props.project.id}
        surface={props.surface}
        copy={c()}
        vault={props.vault}
        busy={props.busy}
        onRun={props.onRun}
        onSave={saveImages}
      />
    </>
  );
}
