import { validateProject } from './projects';
import { openRevision } from './revisions';
import type { Project, SavedProject } from './types';
import type { LocalVault } from '../vault/vault';

function snapshot({ revision, ...project }: SavedProject) {
  return { revision, text: JSON.stringify(project) };
}

export function editorSync(vault: LocalVault) {
  const queue = vault.revisions();

  async function enable(project: string) {
    const state = await queue.readRemote(project);
    if (state.head) throw new Error('An existing cloud revision requires its project key');
    await queue.projectKey(project, state.epoch, true);
    await queue.enableEditor(project, state.epoch);
  }

  async function status() {
    const checkpoints = await queue.checkpoints();
    const drafts = await queue.drafts();
    return { checkpoints, drafts };
  }

  async function stagePending() {
    const { checkpoints, drafts } = await status();
    const available = checkpoints.filter(
      (base) => !drafts.some((row) => row.project === base.project),
    );
    const errors: string[] = [];
    for (const base of available) {
      try {
        const changed = await vault.projects().changed(base.project, base.localRevision);
        if (!changed) continue;
        await queue.stageEditor(
          base,
          changed.revision,
          await queue.projectKey(base.project, base.epoch),
          changed.text,
        );
      } catch {
        errors.push(base.project);
      }
    }
    return errors;
  }

  async function review(project: SavedProject) {
    const draft = await queue.review(project.id);
    if (!draft) throw new Error('No blocked draft');
    const state = await queue.readRemote(project.id);
    const remote = state.head
      ? validateProject(
          JSON.parse(
            await openRevision(
              project.id,
              state.head,
              await queue.projectKey(project.id, state.head.epoch),
            ),
          ) as Project,
          project.id,
        )
      : undefined;
    const base = (await queue.checkpoints()).find((row) => row.project === project.id);
    if (!base) throw new Error('Sync is not enabled');
    return { id: draft.id, state, base, remote, local: project };
  }

  async function resolve(
    reviewed: Awaited<ReturnType<typeof review>>,
    project: SavedProject,
    useRemote: boolean,
  ) {
    if (project.revision !== reviewed.local.revision || project.id !== reviewed.local.id)
      throw new Error('The local copy changed. Review it again.');
    // An existing head in the current epoch must already have a known key.
    const key = await queue.projectKey(
      project.id,
      reviewed.state.epoch,
      reviewed.state.head?.epoch !== reviewed.state.epoch,
    );
    if (useRemote && !reviewed.remote) throw new Error('No cloud copy');
    const next = useRemote
      ? { ...reviewed.remote!, updatedAt: Date.now(), revision: project.revision + 1 }
      : project;
    await queue.resolveEditor(
      reviewed.base,
      reviewed,
      key,
      snapshot(next).text,
      project.revision,
      useRemote,
    );
    return next;
  }

  return { enable, status, stagePending, review, resolve, start: queue.start };
}

export type EditorSync = ReturnType<typeof editorSync>;
