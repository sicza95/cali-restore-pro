import { batch, createSignal } from 'solid-js';
import { historyLimit, masterId, newLayer } from './constants';
import type { Draft, HistoryEntry, Layer, LayerKind, Mark, MarkAction } from './types';

export function createDrawingReview() {
  let sequence = masterId;
  const nextId = () => ++sequence;
  const [layers, setLayers] = createSignal([newLayer(masterId, 'master')]);
  const [selected, select] = createSignal(masterId);
  const [drafts, setDrafts] = createSignal<Record<number, Draft | undefined>>({});
  const [past, setPast] = createSignal<HistoryEntry[]>([]);
  const [future, setFuture] = createSignal<HistoryEntry[]>([]);
  const [manual, setManual] = createSignal(false);
  const layer = () => layers().find(({ id }) => id === selected())!;
  const draft = () => drafts()[selected()];
  const blocked = () => layer().locked || !layer().visible || layer().kind === 'folder';

  function update(id: number, changes: Partial<Layer>) {
    setLayers((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
  function setDraft(id: number, next?: Draft) {
    setDrafts((current) => ({ ...current, [id]: next }));
  }
  function add(kind: LayerKind, from?: Layer) {
    const current = layer();
    const id = nextId();
    const parent = from ? from.parent : current.kind === 'folder' ? current.id : current.parent;
    batch(() => {
      if (parent) update(parent, { expanded: true });
      const created = newLayer(id, kind, parent);
      setLayers((items) => [
        ...items,
        from
          ? {
              ...created,
              opacity: from.opacity,
              fill: from.fill,
              outline: from.outline,
              color: from.color,
              marks: structuredClone(from.marks),
            }
          : created,
      ]);
      select(id);
    });
  }
  function remove() {
    const current = layer();
    if (current.id === masterId || draft() || layers().some(({ parent }) => parent === current.id))
      return;
    batch(() => {
      setLayers((items) => items.filter(({ id }) => id !== current.id));
      setDraft(current.id);
      setPast((items) => items.filter(({ layer }) => layer !== current.id));
      setFuture((items) => items.filter(({ layer }) => layer !== current.id));
      select(current.parent || masterId);
    });
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
    setLayers((items) =>
      items.map((item) =>
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
    batch(() => {
      update(id, { marks: after });
      setPast((items) => [...items, { layer: id, before, after, action }].slice(-historyLimit));
      setFuture([]);
    });
  }
  function accept(mark: Mark, action: MarkAction) {
    if (blocked()) return;
    const current = layer();
    if (manual() || draft()) {
      setDraft(current.id, { pending: [...(draft()?.pending ?? []), mark], undone: [] });
    } else commit([...current.marks, mark], action);
  }
  function commitDraft() {
    const pending = draft()?.pending;
    if (blocked() || !pending?.length) return;
    batch(() => {
      commit([...layer().marks, ...pending], 'batch');
      setDraft(selected());
    });
  }
  function discardDraft() {
    setDraft(selected());
  }
  function editMark(mark: Mark) {
    if (!blocked() && !draft()) {
      commit(
        layer().marks.map((item) => (item.id === mark.id ? mark : item)),
        'points',
      );
    }
  }
  const undoEntry = () => past().at(-1);
  const redoEntry = () => future().at(-1);
  function canStep(redo: boolean) {
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
    batch(() => {
      update(entry.layer, { marks: redo ? entry.after : entry.before });
      const [pop, push] = redo ? [setFuture, setPast] : [setPast, setFuture];
      pop((items) => items.slice(0, -1));
      push((items) => [...items, entry]);
    });
  }

  return {
    layers,
    layer,
    selected,
    select,
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
  };
}

export type DrawingReview = ReturnType<typeof createDrawingReview>;
