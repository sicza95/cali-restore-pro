import { createEffect, createSignal, on } from 'solid-js';
import { brushDefaults, emptySketch, masterId, pointLimit } from './constants';
import type { DrawingReview } from './createDrawingReview';
import { shapePoints } from './geometry';
import type { Mark, Operation, Point, Shape, Sketch, Tool } from './types';

export function createDrawingTools(review: DrawingReview, notify: (notice: 'changed') => void) {
  const [tool, setTool] = createSignal<Tool>('select');
  const [brush, setBrush] = createSignal(brushDefaults);
  const [shape, setShape] = createSignal<Shape>('rectangle');
  const [operation, setOperation] = createSignal<Operation>('add');
  const [sketch, setSketch] = createSignal<Sketch>(emptySketch);
  const [coordinates, setCoordinates] = createSignal<Point>({ x: 50, y: 50 });
  const [resolve, setResolve] = createSignal(false);
  const brushing = () => ['brush', 'eraser', 'master'].includes(tool());
  const sketching = () => tool() === 'pen' || tool() === 'shape' || tool() === 'nodes';
  const node = () => sketch().points[sketch().index];
  const reset = () => setSketch(emptySketch);

  createEffect(
    on(
      review.selected,
      (id) => {
        reset();
        if (tool() === 'master' && id !== masterId) setTool('select');
        if (tool() === 'nodes' && (review.draft() || !review.layer().marks.length))
          setTool('select');
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      () => review.layer().marks,
      (marks) => {
        const { mark } = sketch();
        if (mark && !marks.includes(mark)) reset();
      },
      { defer: true },
    ),
  );

  function edit(mark: Mark) {
    setSketch({ mark, points: mark.points, closed: mark.closed, index: 0 });
  }
  function activate(next: Tool) {
    if (next === tool()) return;
    if (next === 'nodes' && review.draft()) {
      setResolve(true);
      return;
    }
    reset();
    if (next === 'master') review.select(masterId);
    setTool(next);
  }
  async function resolveDraft(choice: 'commit' | 'discard' | 'cancel') {
    if (choice === 'commit' && !(await review.commitDraft())) return false;
    setResolve(false);
    if (choice === 'cancel') return false;
    if (choice === 'discard') review.discardDraft();
    if (review.layer().marks.length) activate('nodes');
    return true;
  }
  async function stroke(points: Point[], width = brush().width) {
    const erase = tool() === 'eraser';
    const action = erase ? 'erase' : 'stroke';
    if (
      await review.accept(
        {
          id: review.nextId(),
          action,
          points,
          width,
          operation: erase ? 'subtract' : 'add',
          closed: false,
        },
        action,
      )
    )
      notify('changed');
  }
  const cornerShape = () => tool() === 'shape' && shape() !== 'polygon';
  const minimum = () =>
    sketch().closed || (tool() === 'shape' && !cornerShape())
      ? 3
      : tool() === 'nodes' &&
          (sketch().mark?.action === 'stroke' || sketch().mark?.action === 'erase')
        ? 1
        : 2;
  const maximum = () => (cornerShape() ? 2 : pointLimit);
  function addPoint(point: Point) {
    if (!review.contains(point)) return;
    const current = sketch();
    if (current.points.length >= maximum() || (tool() === 'nodes' && !current.mark)) return;
    const index = tool() === 'nodes' ? current.index + 1 : current.points.length;
    const points = current.points.slice();
    points.splice(index, 0, point);
    setSketch({ ...current, points, index });
  }
  function place(point: Point) {
    if (tool() === 'nodes' && node()) updatePoint(point);
    if (tool() === 'pen' || tool() === 'shape') addPoint(point);
  }
  function updatePoint(changes: Partial<Point>) {
    const current = sketch();
    setSketch({
      ...current,
      points: current.points.map((point, index) =>
        index === current.index ? { ...point, ...changes } : point,
      ),
    });
  }
  function deletePoint() {
    const current = sketch();
    const points = current.points.filter((_, index) => index !== current.index);
    setSketch({
      ...current,
      points,
      index: Math.max(0, Math.min(current.index, points.length - 1)),
    });
  }
  const valid = () => {
    const points = sketch().points;
    if (tool() === 'nodes' && !sketch().mark) return false;
    if (points.length < minimum()) return false;
    if (cornerShape() && (points[0]!.x === points[1]!.x || points[0]!.y === points[1]!.y))
      return false;
    return tool() === 'nodes'
      ? points.every(
          (point) =>
            sketch().mark!.points.includes(point) ||
            (review.contains(point) && (!point.handle || review.contains(point.handle))),
        )
      : review.containsMark(previewMark());
  };
  const previewMark = (): Mark => {
    const { mark, points, closed } = sketch();
    const shaped = tool() === 'shape' && points.length >= minimum();
    return {
      id: mark?.id ?? 0,
      action: mark?.action ?? (tool() === 'shape' ? 'shape' : 'path'),
      points: shaped ? shapePoints(shape(), points) : points,
      closed: shaped || closed,
      operation: mark?.operation ?? operation(),
      width: mark?.width ?? 0.65,
      region: mark?.region,
    };
  };
  async function apply() {
    if (!valid() || review.blocked()) return;
    const mark = previewMark();
    const accepted =
      tool() === 'nodes'
        ? await review.editMark(mark)
        : await review.accept({ ...mark, id: review.nextId() }, mark.action);
    if (!accepted) return;
    reset();
    notify('changed');
  }
  return {
    tool,
    brush,
    setBrush,
    shape,
    setShape,
    operation,
    setOperation,
    sketch,
    setSketch,
    coordinates,
    setCoordinates,
    resolve,
    resolveDraft,
    activate,
    edit,
    reset,
    node,
    brushing,
    sketching,
    stroke,
    place,
    addPoint,
    updatePoint,
    deletePoint,
    minimum,
    maximum,
    valid,
    apply,
    previewMark,
  };
}

export type DrawingTools = ReturnType<typeof createDrawingTools>;
