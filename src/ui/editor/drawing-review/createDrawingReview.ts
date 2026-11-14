import {
  checkDrafts,
  drawingHistory,
  recordHistory,
  stepAssessment,
} from '../../../platform/projects/surface-journal';
import type { HistoryEntry, SurfaceJournal } from '../../../platform/projects/surface-journal';
import { createEffect, createMemo, createSignal, on } from 'solid-js';
import { commitDrawing } from '../../../platform/projects/drawing-state';
import type { PlanarSurface, Ring } from '../../../platform/projects/planar-types';
import { masterId, newLayer } from './constants';
import {
  insideRegion,
  restoreLayers,
  restoreMark,
  storedLayers,
  storedMark,
} from './drawing-document';
import type { Draft, Layer, LayerKind, Mark, MarkAction, Point } from './types';

export function createDrawingReview(options: {
  state: () => PlanarSurface | undefined;
  region: () => Ring | undefined;
  journal: () => SurfaceJournal | undefined;
  save: (journal: SurfaceJournal, state?: PlanarSurface) => Promise<boolean>;
  busy: () => boolean;
}) {
  let sequence = masterId;
  function nextId() {
    do sequence++;
    while (layers().some((row) => row.key === String(sequence)));
    return sequence;
  }
  const layers = createMemo(() => restoreLayers(options.state()));
  const [selected, select] = createSignal(masterId);
  const drafts = createMemo<Record<number, Draft>>(() => {
    const source = options.state()?.source;
    const journal = options.journal();
    if (!source || !journal || journal.conflict) return {};
    return Object.fromEntries(
      journal.drafts.map(({ layer, pending, undone }) => [
        layer,
        {
          pending: pending.map((mark) => restoreMark(mark, source)),
          undone: undone.map((mark) => restoreMark(mark, source)),
        },
      ]),
    );
  });
  const past = () => options.journal()?.past ?? [];
  const future = () => options.journal()?.future ?? [];
  const manual = () => options.journal()?.manual ?? false;
  const [saving, setSaving] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const layer = () => layers().find(({ id }) => id === selected()) ?? layers()[0]!;
  const draft = () => drafts()[selected()];
  const busy = () =>
    saving() || options.busy() || !options.journal() || !!options.journal()?.conflict;
  const blocked = () =>
    busy() || !options.region() || layer().locked || !layer().visible || layer().kind === 'folder';

  createEffect(
    on([layers, drafts, past, future], ([rows, pending, earlier, later]) => {
      for (const row of rows) {
        sequence = Math.max(sequence, row.id);
        for (const mark of row.marks) sequence = Math.max(sequence, mark.id);
      }
      for (const draft of Object.values(pending))
        for (const mark of [...draft.pending, ...draft.undone])
          sequence = Math.max(sequence, mark.id);
      for (const entry of [...earlier, ...later])
        if ('drawing' in entry)
          for (const id of [...entry.drawing.before.order, ...entry.drawing.after.order])
            sequence = Math.max(sequence, id);
      if (!rows.some((row) => row.id === selected())) select(masterId);
    }),
  );
  const changed = (id: number, changes: Partial<Layer>) =>
    layers().map((item) => (item.id === id ? { ...item, ...changes } : item));
  const contains = (point: Point) => {
    const state = options.state();
    const region = options.region();
    return !!state && !!region && insideRegion(point, state.source, region);
  };
  const containsMark = (mark: Mark) =>
    mark.points.every((point) => contains(point) && (!point.handle || contains(point.handle)));

  async function persist(
    change: (journal: SurfaceJournal) => { journal: SurfaceJournal; state?: PlanarSurface },
  ) {
    const journal = options.journal();
    if (!journal || !options.state() || busy()) return false;
    setSaving(true);
    setFailed(false);
    try {
      const next = change(journal);
      if (await options.save(next.journal, next.state)) return true;
    } catch {
      // The existing journal and assessment are still available for retry.
    } finally {
      setSaving(false);
    }
    setFailed(true);
    return false;
  }
  function persistRows(
    rows: Layer[],
    affected: Layer,
    action: HistoryEntry['action'] = 'layerChange',
    clearDraft = false,
  ) {
    return persist((journal) => {
      const state = options.state()!;
      const visible = layers();
      const before = state.drawing ?? storedLayers(visible, state.source);
      const originals = new Map(
        visible.map((row, index) => [row.id, { row, saved: before[index]! }]),
      );
      const after = rows.map((row) => {
        const original = originals.get(row.id);
        if (row === original?.row) return original.saved;
        const marks = new Map(
          original?.row.marks.map((mark, index) => [mark, original.saved.marks[index]!]),
        );
        return {
          ...row,
          marks: row.marks.map((mark) => marks.get(mark) ?? storedMark(mark, state.source)),
        };
      });
      const { id, name, kind } = affected;
      const next = recordHistory(
        journal,
        drawingHistory(before, after, { id, name, kind }, action),
      );
      if (clearDraft) next.drafts = next.drafts.filter((draft) => draft.layer !== id);
      return { journal: next, state: commitDrawing(state, after) };
    });
  }
  function update(id: number, changes: Partial<Layer>) {
    const rows = changed(id, changes).map((row) =>
      row.id === changes.parent ? { ...row, expanded: true } : row,
    );
    return persistRows(
      rows,
      rows.find((row) => row.id === id)!,
    );
  }
  function setDraft(id: number, next?: Draft) {
    return persist((journal) => {
      const state = options.state()!;
      const drafts = journal.drafts.filter((draft) => draft.layer !== id);
      if (next)
        drafts.push({
          layer: id,
          pending: next.pending.map((mark) => storedMark(mark, state.source)),
          undone: next.undone.map((mark) => storedMark(mark, state.source)),
        });
      checkDrafts(drafts, state.drawing ?? storedLayers(layers(), state.source));
      return { journal: { ...journal, drafts } };
    });
  }
  async function add(kind: LayerKind, from?: Layer) {
    const current = layer();
    const id = nextId();
    const parent = from ? from.parent : current.kind === 'folder' ? current.id : current.parent;
    const rows = parent ? changed(parent, { expanded: true }) : layers();
    const created = { ...newLayer(id, kind, parent), key: crypto.randomUUID() };
    if (
      await persistRows(
        [
          ...rows,
          from
            ? {
                ...created,
                opacity: from.opacity,
                fill: from.fill,
                pattern: from.pattern,
                outline: from.outline,
                color: from.color,
                base: from.base,
                marks: structuredClone(from.marks),
              }
            : created,
        ],
        created,
      )
    )
      select(id);
  }
  async function remove() {
    const current = layer();
    if (current.id === masterId || draft() || layers().some(({ parent }) => parent === current.id))
      return;
    if (
      await persistRows(
        layers().filter(({ id }) => id !== current.id),
        current,
      )
    )
      select(current.parent || masterId);
  }
  const siblings = () => layers().filter(({ parent }) => parent === layer().parent);
  function neighbor(delta: number) {
    const items = siblings();
    const target = items[items.findIndex(({ id }) => id === selected()) + delta];
    return target?.id !== masterId && selected() !== masterId ? target : undefined;
  }
  function move(delta: number) {
    const target = neighbor(delta);
    if (!target) return;
    const current = layer();
    return persistRows(
      layers().map((item) =>
        item.id === current.id ? target : item.id === target.id ? current : item,
      ),
      current,
    );
  }
  function parentChoices() {
    const insideCurrent = (id: number): boolean => {
      if (id === selected()) return true;
      const parent = layers().find((item) => item.id === id)?.parent;
      return !!parent && insideCurrent(parent);
    };
    return layers().filter((item) => item.kind === 'folder' && !insideCurrent(item.id));
  }
  function commit(after: Mark[], action: MarkAction) {
    const current = layer();
    return persistRows(changed(current.id, { marks: after }), current, action, action === 'batch');
  }
  async function accept(mark: Mark, action: MarkAction) {
    const region = options.region();
    if (blocked() || !region || !containsMark(mark)) return false;
    mark = { ...mark, region };
    const current = layer();
    if (manual() || draft()) {
      return setDraft(current.id, { pending: [...(draft()?.pending ?? []), mark], undone: [] });
    }
    return commit([...current.marks, mark], action);
  }
  function commitDraft() {
    const pending = draft()?.pending;
    if (blocked() || !pending?.length) return Promise.resolve(false);
    return commit([...layer().marks, ...pending], 'batch');
  }
  function discardDraft() {
    return setDraft(selected());
  }
  function editMark(mark: Mark) {
    const before = layer().marks.find((item) => item.id === mark.id);
    if (
      !blocked() &&
      !draft() &&
      before &&
      mark.points.every(
        (point) =>
          before.points.includes(point) ||
          (contains(point) && (!point.handle || contains(point.handle))),
      )
    ) {
      return commit(
        layer().marks.map((item) => (item.id === mark.id ? mark : item)),
        'points',
      );
    }
    return Promise.resolve(false);
  }
  const undoEntry = () => past().at(-1);
  const redoEntry = () => future().at(-1);
  function canStep(redo: boolean) {
    if (busy()) return false;
    const current = draft();
    if (current) return !blocked() && (redo ? current.undone : current.pending).length > 0;
    const entry = redo ? redoEntry() : undoEntry();
    if (!entry || !options.state()) return false;
    if ('checkpoint' in entry) return !Object.keys(drafts()).length;
    if (entry.action === 'layerChange' || !entry.layer) {
      if (!('drawing' in entry)) return true;
      const target = entry.drawing[redo ? 'after' : 'before'];
      return Object.keys(drafts()).every((id) => target.order.includes(Number(id)));
    }
    return !drafts()[entry.layer.id] && !layers().find(({ id }) => id === entry.layer?.id)?.locked;
  }
  function step(redo: boolean) {
    if (!canStep(redo)) return;
    const current = draft();
    if (current) {
      const from = redo ? 'undone' : 'pending';
      const to = redo ? 'pending' : 'undone';
      return setDraft(selected(), {
        [from]: current[from].slice(0, -1),
        [to]: [...current[to], current[from].at(-1)!],
      } as Draft);
    }
    const entry = (redo ? redoEntry() : undoEntry())!;
    return persist((journal) => {
      const state = options.state()!;
      const next = stepAssessment(
        state,
        state.drawing ?? storedLayers(layers(), state.source),
        entry,
        redo,
      );
      return {
        journal: {
          ...journal,
          past: redo ? [...journal.past, entry] : journal.past.slice(0, -1),
          future: redo ? journal.future.slice(0, -1) : [...journal.future, entry],
        },
        state: next,
      };
    });
  }

  return {
    layers,
    layer,
    selected,
    select: (id: number) => {
      if (!busy()) select(id);
    },
    update,
    add,
    remove,
    neighbor,
    move,
    parentChoices,
    nextId,
    manual,
    setManual: (manual: boolean) => persist((journal) => ({ journal: { ...journal, manual } })),
    drafts,
    draft,
    blocked,
    accept,
    commitDraft,
    discardDraft,
    editMark,
    past,
    future,
    undoEntry,
    redoEntry,
    canStep,
    step,
    busy,
    failed,
    contains,
    containsMark,
  };
}

export type DrawingReview = ReturnType<typeof createDrawingReview>;
