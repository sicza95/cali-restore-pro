import { ProjectGroupInvites } from './ProjectGroupInvites';
import { organisationCopy } from '../../organisations/organisation-copy';
import { createSignal, lazy, Show } from 'solid-js';
import { useApp } from '../../app-context/AppContext';
const ProjectReview = lazy(() =>
  import('../../project-review/ProjectReview').then((module) => ({
    default: module.ProjectReview,
  })),
);
import type { ReviewRoute } from '../../reports/report-controls';
import { ProjectAccessSection } from '../access';
import { browserCopy } from '../browser/browser-copy';
import { DialogShell } from '../browser/dialogs/DialogShell';
import { itemActionCopy } from '../browser/item-actions/copy';
import { ManageDefaults } from './ManageDefaults';
import type { ItemDialog } from './useItemOperations';
import type { Workspace } from './types';

export function ItemOperationDialogs(props: {
  ws: Workspace;
  value: ItemDialog;
  hosted: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const app = useApp();
  const c = () => itemActionCopy[props.ws.language];
  const [sharingTab, setSharingTab] = createSignal<'members' | 'groups'>('members');
  const [route, setRoute] = createSignal<ReviewRoute>('estimates');
  const [failed, setFailed] = createSignal(false);
  const project = () => props.ws.projects().find((p) => p.id === props.value.item.projectId);
  const title = () => c()[props.value.kind === 'unhost' ? 'hosting' : props.value.kind];
  return (
    <DialogShell
      title={
        title() +
        ' · ' +
        (props.value.kind === 'manage' ? props.value.item.name : (project()?.name ?? ''))
      }
      closeLabel={browserCopy[props.ws.language].close}
      onClose={props.onClose}
    >
      <Show when={project()}>
        {(p) => (
          <>
            <Show when={props.value.kind === 'share'}>
              <p>{c().projectScope}</p>
              <div class="project-review-nav" role="tablist" aria-label={c().share}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sharingTab() === 'members'}
                  onClick={() => setSharingTab('members')}
                >
                  {organisationCopy[props.ws.language].membersHeading}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sharingTab() === 'groups'}
                  onClick={() => setSharingTab('groups')}
                >
                  {organisationCopy[props.ws.language].groups}
                </button>
              </div>
              <div role="tabpanel">
                <Show
                  when={sharingTab() === 'members'}
                  fallback={<ProjectGroupInvites project={p()} hosted={props.hosted} />}
                >
                  <ProjectAccessSection
                    project={p()}
                    hosted={props.hosted}
                    account={app.account()}
                    canManage
                  />
                </Show>
              </div>
            </Show>
            <Show when={props.value.kind === 'manage'}>
              <ManageDefaults ws={props.ws} item={props.value.item} />
            </Show>
            <Show when={props.value.kind === 'reports'}>
              <ProjectReview
                vault={props.ws.vault}
                project={p()}
                language={props.ws.language}
                account={app.account()!.id}
                route={route()}
                navigate={(href) => {
                  const tab = href.split('/').at(-1);
                  if (tab === 'estimates' || tab === 'reports' || tab === 'outputs') setRoute(tab);
                  else props.ws.navigate(href);
                }}
              />
            </Show>
            <Show when={props.value.kind === 'unhost'}>
              <p>{c().hostingConfirm}</p>
              <button
                type="button"
                disabled={props.ws.busy()}
                data-control-id="browser.hosting.remove"
                onClick={() => {
                  setFailed(false);
                  void props.ws
                    .run(async () => {
                      // Refuse removal unless the full local project can be backed up.
                      await props.ws.vault.projectBackups().export(p().id);
                      await app.request(
                        '/hosted-projects/' + p().id + '/hosting',
                        { confirm: true },
                        'DELETE',
                      );
                      await props.ws.sync.sync.forget(p().id);
                    })
                    .then((ok) => {
                      if (ok) {
                        props.onChanged();
                        props.onClose();
                      } else setFailed(true);
                    });
                }}
              >
                {c().hosting}
              </button>
              <Show when={failed()}>
                <p role="alert">{c().failed}</p>
              </Show>
            </Show>
          </>
        )}
      </Show>
    </DialogShell>
  );
}
