import { expect, test } from '@playwright/test';

test('project revisions reject stale edits and vault forget removes encrypted documents', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const vaultModule = '/src/platform/vault/vault.ts';
    const storeModule = '/src/platform/vault/store.ts';
    const projectModule = '/src/platform/projects/projects.ts';
    const { LocalVault } = (await import(
      vaultModule
    )) as typeof import('../src/platform/vault/vault');
    const { connect, journalTable, projectTable, patternTable } = (await import(
      storeModule
    )) as typeof import('../src/platform/vault/store');
    const { localProjects, newProject } = (await import(
      projectModule
    )) as typeof import('../src/platform/projects/projects');
    const vault = new LocalVault('test-account', () => undefined);
    await vault.create('bb'.repeat(32), true);
    const projects = localProjects(vault);
    const project = await projects.save(newProject('Hidden project', 'Object', 'Surface', 'EUR'));
    await projects.save({ ...project, name: 'New hidden name' });
    const stale = await projects.save({ ...project, name: 'Stale edit' }).then(
      () => false,
      () => true,
    );
    const [head] = await projects.list();
    const ref = {
      project: project.id,
      surface: project.objects[0]!.surfaces[0]!.id,
      source: crypto.randomUUID(),
    };
    const draft = { ref, expected: 0, text: 'pending private stroke' };
    const documents = vault.projects();
    await documents.saveJournal(draft, head!.revision);
    const staleJournal = await projects
      .save({ ...head!, name: 'Must roll back' }, undefined, draft)
      .then(
        () => false,
        () => true,
      );
    const recovered = await documents.readJournal(ref);
    await projects.save({ ...head!, name: 'New hidden name' }, undefined, {
      ...draft,
      expected: 1,
      text: 'committed history',
    });
    const committed = await documents.readJournal(ref);
    await vault.patterns().save(crypto.randomUUID(), 0, 'private pattern');
    const db = await connect();
    const read = (table: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(table).objectStore(table).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const raw = JSON.stringify(await read(projectTable));
    const rawJournal = JSON.stringify(await read(journalTable));
    const rawPatterns = JSON.stringify(await read(patternTable));
    const [saved] = await projects.list();
    vault.lock();
    const locked = await projects.list().then(
      () => false,
      () => true,
    );
    const journalLocked = await documents.readJournal(ref).then(
      () => false,
      () => true,
    );
    await vault.forget(true);
    const forgotten = (
      await Promise.all([projectTable, journalTable, patternTable].map(read))
    ).every((rows) => !rows.length);
    db.close();
    vault.close();
    return {
      stale,
      locked,
      forgotten,
      staleJournal,
      journalLocked,
      recovered,
      committed,
      privateRows:
        !rawJournal.includes('committed history') && !rawPatterns.includes('private pattern'),
      hidden: !raw.includes('hidden name'),
      revision: saved?.revision,
      name: saved?.name,
    };
  });
  expect(result).toEqual({
    stale: true,
    locked: true,
    forgotten: true,
    hidden: true,
    staleJournal: true,
    journalLocked: true,
    recovered: { revision: 1, text: 'pending private stroke' },
    committed: { revision: 2, text: 'committed history' },
    privateRows: true,
    revision: 3,
    name: 'New hidden name',
  });
});

test('retention prunes the redo branch while keeping a draft and the checkpoint recoverable', async ({
  page,
}) => {
  await page.goto('/');
  const actual = await page.evaluate(async () => {
    const journalModule = '/src/platform/projects/surface-journal.ts';
    const planarModule = '/src/platform/projects/planar-state.ts';
    const checkpointModule = '/src/platform/projects/assessment-checkpoints.ts';
    const { emptyJournal, journalHead, journalText, openJournal, photoHistory, recordHistory } =
      (await import(journalModule)) as typeof import('../src/platform/projects/surface-journal');
    const { newPlanarSurface, calibrate } = (await import(
      planarModule
    )) as typeof import('../src/platform/projects/planar-state');
    const { captureCheckpoint, restoreCheckpoint } = (await import(
      checkpointModule
    )) as typeof import('../src/platform/projects/assessment-checkpoints');
    const source = { id: crypto.randomUUID(), width: 640, height: 480, embeddedPreview: false };
    const start = newPlanarSurface(source);
    const checkpoint = captureCheckpoint('Baseline', start);
    let state = start;
    let journal = emptyJournal();
    for (let i = 1; i <= 35; i++) {
      const next = calibrate(state, { method: 'dimensions', width: i, height: 1, unit: 'm' });
      journal = recordHistory(journal, photoHistory(state, next));
      state = next;
    }
    const entry = journal.past.at(-1)!;
    journal = recordHistory(
      { ...journal, past: journal.past.slice(0, -1), future: [entry] },
      entry,
    );
    journal.head = await journalHead(state);
    journal.drafts = [
      {
        layer: 1,
        pending: [
          {
            id: 10,
            action: 'stroke',
            points: [{ at: [10, 10] }],
            operation: 'add',
            closed: false,
            width: 5,
            region: [
              [0, 0],
              [640, 0],
              [640, 480],
              [0, 480],
            ],
          },
        ],
        undone: [],
      },
    ];
    const text = journalText(journal);
    const reopened = await openJournal(text, state);
    const restored = restoreCheckpoint(state, checkpoint);
    const conflict = await openJournal(text, restored);
    return {
      retained: reopened.past.length,
      redo: reopened.future.length,
      draft: reopened.drafts[0]?.pending[0]?.id,
      conflict: conflict.conflict && conflict.drafts[0]?.pending[0]?.id,
      restoredRevision: restored.revision,
      restoredCalibration: restored.calibration ?? null,
      checkpointRevision: checkpoint.assessment.revision,
    };
  });
  expect(actual).toEqual({
    retained: 30,
    redo: 0,
    draft: 10,
    conflict: 10,
    restoredRevision: 36,
    restoredCalibration: null,
    checkpointRevision: 0,
  });
});
