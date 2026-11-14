import { batch, createEffect, createSignal, on } from 'solid-js';
import { commitDrawing } from '../../../platform/projects/drawing-state';
import type { PlanarSurface, Ring } from '../../../platform/projects/planar-types';
import { historyLimit, masterId, newLayer } from './constants';
import { insideRegion, restoreLayers, storedLayers } from './drawing-document';
import type { Draft, HistoryEntry, Layer, LayerKind, Mark, MarkAction, Point } from './types';

export function createDrawingReview(options: {
  state: () => PlanarSurface | undefined;
  region: () => Ring | undefined;
  save: (state: PlanarSurface) => Promise<boolean>;
  busy: () => boolean;
}) {
  let sequence = masterId;
  function nextId() {
    do sequence++;
    while (layers().some((row) => row.key === String(sequence)));
    return sequence;
  }
  const [layers, setLayers] = createSignal([newLayer(masterId, 'master')]);
  const [selected, select] = createSignal(masterId);
  const [drafts, setDrafts] = createSignal<Record<number, Draft | undefined>>({});
  const [past, setPast] = createSignal<HistoryEntry[]>([]);
  const [future, setFuture] = createSignal<HistoryEntry[]>([]);
  const [manual, setManual] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const layer = () => layers().find(({ id }) => id === selected())!;
  const draft = () => drafts()[selected()];
  const busy = () => saving() || options.busy();
  const blocked = () =>
    busy() || !options.region() || layer().locked || !layer().visible || layer().kind === 'folder';

  let loaded = false;
  createEffect(
    on(options.state, (state) => {
      if (!state || loaded) return;
      const rows = restoreLayers(state);
      sequence = Math.max(
        sequence,
        ...rows.flatMap((row) => [row.id, ...row.marks.map((mark) => mark.id)]),
      );
      setLayers(rows);
      loaded = true;
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

  async function persist(rows: Layer[], accepted?: () => void) {
    const state = options.state();
    if (!state || busy()) return false;
    setSaving(true);
    setFailed(false);
    try {
      if (await options.save(commitDrawing(state, storedLayers(rows, state.source)))) {
        batch(() => {
          setLayers(rows);
          accepted?.();
        });
        return true;
      }
    } catch {
      // Keep the committed rows and any draft available for retry.
    } finally {
      setSaving(false);
    }
    setFailed(true);
    return false;
  }
  function update(id: number, changes: Partial<Layer>) {
    const rows = changed(id, changes).map((row) =>
      row.id === changes.parent ? { ...row, expanded: true } : row,
    );
    return persist(rows);
  }
  function setDraft(id: number, next?: Draft) {
    setDrafts((current) => ({ ...current, [id]: next }));
  }
  function add(kind: LayerKind, from?: Layer) {
    const current = layer();
    const id = nextId();
    const parent = from ? from.parent : current.kind === 'folder' ? current.id : current.parent;
    const rows = parent ? changed(parent, { expanded: true }) : layers();
    const created = newLayer(id, kind, parent);
    return persist(
      [
        ...rows,
        from
          ? {
              ...created,
              opacity: from.opacity,
              fill: from.fill,
              outline: from.outline,
              color: from.color,
              base: from.base,
              marks: structuredClone(from.marks),
            }
          : created,
      ],
      () => select(id),
    );
  }
  function remove() {
    const current = layer();
    if (current.id === masterId || draft() || layers().some(({ parent }) => parent === current.id))
      return;
    return persist(
      layers().filter(({ id }) => id !== current.id),
      () => {
        setDraft(current.id);
        setPast((items) => items.filter(({ layer }) => layer !== current.id));
        setFuture((items) => items.filter(({ layer }) => layer !== current.id));
        select(current.parent || masterId);
      },
    );
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
    return persist(
      layers().map((item) =>
        item.id === current.id ? target : item.id === target.id ? current : item,
      ),
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
    const { id, marks: before } = layer();
    return persist(changed(id, { marks: after }), () => {
      setPast((items) => [...items, { layer: id, before, after, action }].slice(-historyLimit));
      setFuture([]);
      if (action === 'batch') setDraft(id);
    });
  }
  async function accept(mark: Mark, action: MarkAction) {
    const region = options.region();
    if (blocked() || !region || !containsMark(mark)) return false;
    mark = { ...mark, region };
    const current = layer();
    if (manual() || draft()) {
      setDraft(current.id, { pending: [...(draft()?.pending ?? []), mark], undone: [] });
      return true;
    }
    return commit([...current.marks, mark], action);
  }
  function commitDraft() {
    const pending = draft()?.pending;
    if (blocked() || !pending?.length) return Promise.resolve(false);
    return commit([...layer().marks, ...pending], 'batch');
  }
  function discardDraft() {
    if (!busy()) setDraft(selected());
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
    return !!entry && !layers().find(({ id }) => id === entry.layer)?.locked;
  }
  function step(redo: boolean) {
    if (!canStep(redo)) return;
    const current = draft();
    if (current) {
      const from = redo ? 'undone' : 'pending';
      const to = redo ? 'pending' : 'undone';
      setDraft(selected(), {
        [from]: current[from].slice(0, -1),
        [to]: [...current[to], current[from].at(-1)!],
      } as Draft);
      return;
    }
    const entry = (redo ? redoEntry() : undoEntry())!;
    return persist(changed(entry.layer, { marks: redo ? entry.after : entry.before }), () => {
      const [pop, push] = redo ? [setFuture, setPast] : [setPast, setFuture];
      pop((items) => items.slice(0, -1));
      push((items) => [...items, entry]);
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
    setManual,
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
