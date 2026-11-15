import { createResource } from 'solid-js';
import {
  emptyJournal,
  journalHead,
  journalText,
  openJournal,
} from '../../../platform/projects/surface-journal';
import type { SurfaceJournal } from '../../../platform/projects/surface-journal';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import type { JournalRef, JournalWrite } from '../../../platform/vault/project-store';
import type { LocalVault } from '../../../platform/vault/vault';

export function createSurfaceJournal(options: {
  vault: () => LocalVault;
  ref: (source: string) => JournalRef;
  source: () => string | undefined;
  assessment: () => PlanarSurface | undefined;
  projectRevision: () => number;
  run: (task: () => Promise<void>) => Promise<boolean>;
  saveAssessment: (assessment: PlanarSurface, write: JournalWrite) => Promise<void>;
}) {
  const [row, { mutate, refetch }] = createResource(options.source, async (source) => {
    const assessment = options.assessment();
    const document = await options.vault().projects().readJournal(options.ref(source));
    return {
      source,
      assessment,
      revision: document?.revision ?? 0,
      journal: await openJournal(document?.text, assessment),
    };
  });
  const failed = () => !!row.error;
  const value = () => {
    if (failed() || row.loading) return;
    const current = row();
    if (current?.source === options.source()) return current;
  };
  const journal = () => {
    const current = value();
    if (!current) return;
    if (current.assessment === options.assessment()) return current.journal;
    return {
      ...emptyJournal(),
      manual: current.journal.manual,
      drafts: current.journal.drafts,
      conflict: current.journal.drafts.length > 0,
    };
  };

  function save(
    next: SurfaceJournal,
    assessment?: PlanarSurface,
    saveAssessment = options.saveAssessment,
  ) {
    const source = options.source();
    const current = value();
    if (!source || !current) return Promise.resolve(false);
    const ref = options.ref(source);
    const projects = options.vault().projects();
    const projectRevision = options.projectRevision();
    return options.run(async () => {
      const updated = { ...next, head: await journalHead(assessment ?? options.assessment()) };
      const write = { ref, expected: current.revision, text: journalText(updated) };
      if (assessment) await saveAssessment(assessment, write);
      else await projects.saveJournal(write, projectRevision);
      mutate({
        source,
        assessment: options.assessment(),
        revision: current.revision + 1,
        journal: updated,
      });
    });
  }
  const discardConflict = () => {
    const current = journal();
    if (!current?.conflict) return;
    return save({ ...emptyJournal(), manual: current.manual });
  };
  return { journal, save, discardConflict, failed, refetch };
}
