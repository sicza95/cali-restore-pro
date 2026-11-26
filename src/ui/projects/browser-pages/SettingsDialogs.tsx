import { useDialogEntity } from './DialogEntity';
import { projectItems } from '../../../platform/projects/browser/browser-model';
import { Show } from 'solid-js';
import type { SavedProject } from '../../../platform/projects/types';
import { accountPaths } from '../../router/constants';
import { followLink } from '../../router/routes';
import { ProjectReviewLinks } from '../../project-review/ProjectReviewLinks';
import { ProjectInvitations } from '../../sharing/ProjectInvitations';
import { projectSnapshot } from '../../../platform/projects/shared-project';
import { DialogShell } from '../browser/dialogs/DialogShell';
import { browserCopy } from '../browser/browser-copy';
import { ProjectBackup } from '../ProjectBackup';
import { ProjectLifecycle } from '../ProjectLifecycle';
import { ProjectSync } from '../ProjectSync';
import { projectCopy } from '../project-copy';
import { subtreePhotos } from './useOriginals';
import { pageCopy } from './copy';
import type { Workspace } from './types';

/** Root gear: the account's defaults and branding stay on the Settings page; this links to them. */
export function RootSettingsDialog(props: {
  ws: Workspace;
  localName: (id: string) => string | undefined;
  onClose: () => void;
}) {
  const c = () => pageCopy[props.ws.language];
  const p = () => projectCopy[props.ws.language];
  const go = (event: MouseEvent) => {
    // eslint-disable-next-line solid/reactivity -- followLink calls this during the click
    followLink(event, (href) => {
      props.onClose();
      props.ws.navigate(href);
    });
  };
  return (
    <DialogShell
      title={browserCopy[props.ws.language].accountSettings}
      closeLabel={browserCopy[props.ws.language].close}
      onClose={props.onClose}
    >
      <div class="project-settings">
        <p>{c().rootSettingsHelp}</p>
        <nav class="project-settings-links">
          <a
            data-control-id="browser.settings.defaults"
            href={accountPaths.preferences + '#defaults'}
            onClick={go}
          >
            {c().restorationLink}
          </a>
          <a
            data-control-id="browser.settings.branding"
            href={accountPaths.preferences + '#report-branding'}
            onClick={go}
          >
            {c().brandingLink}
          </a>
          <a data-control-id="projects.offline" href="/offline-originals">
            {p().offlineShelf}
          </a>
        </nav>
        <ProjectLifecycle localName={props.localName} />
      </div>
    </DialogShell>
  );
}

/**
 * Project gear: everything the old project page offered besides editing the hierarchy, which the
 * browser now does. Nothing here is new behaviour; the same panels moved.
 */
export function ProjectSettingsDialog(props: {
  ws: Workspace;
  project: SavedProject;
  onClose: () => void;
}) {
  const summary = useDialogEntity(
    () => props.ws,
    () =>
      projectItems({
        organisation: props.project.organisation ?? null,
        local: [props.project],
      })[0]!,
    () => true,
  );
  const c = () => pageCopy[props.ws.language];
  const p = () => projectCopy[props.ws.language];
  return (
    <DialogShell
      title={browserCopy[props.ws.language].projectSettings}
      sidebar={summary()}
      closeLabel={browserCopy[props.ws.language].close}
      onClose={props.onClose}
    >
      <div class="project-settings">
        <Show when={!props.project.archived}>
          <section class="project-pane" aria-label={c().reviewLinks}>
            <h3>{c().reviewLinks}</h3>
            <ProjectReviewLinks
              project={props.project.id}
              language={props.ws.language}
              navigate={(href) => {
                props.onClose();
                props.ws.navigate(href);
              }}
            />
          </section>
          <section class="project-pane" aria-label={c().sharing}>
            <ProjectInvitations
              projectId={props.project.id}
              project={projectSnapshot(props.project)}
              originalIds={subtreePhotos(props.project)}
              canHost
              organisation={props.project.organisation}
              vault={props.ws.vault}
              onHosted={() => props.ws.sync.initialSync(props.project)}
            />
          </section>
        </Show>
        <ProjectSync
          projectId={props.project.id}
          project={props.project}
          language={props.ws.language}
          model={props.ws.sync}
          busy={props.ws.busy()}
          run={props.ws.run}
          onResolved={props.ws.update}
        />
        <section class="project-pane">
          <ProjectBackup
            project={props.project.id}
            vault={props.ws.vault}
            language={props.ws.language}
            busy={props.ws.busy()}
            run={props.ws.run}
          />
        </section>
        <section class="project-pane">
          <p>{c().archiveHelp}</p>
          <button
            type="button"
            disabled={props.ws.busy()}
            data-control-id="project.archive"
            onClick={() =>
              void props.ws.run(() =>
                props.ws.save({ ...props.project, archived: !props.project.archived }),
              )
            }
          >
            {props.project.archived ? p().restore : p().archive}
          </button>
        </section>
        <ProjectLifecycle project={props.project.id} />
      </div>
    </DialogShell>
  );
}
