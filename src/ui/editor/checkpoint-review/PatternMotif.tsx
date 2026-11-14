import { createSignal } from 'solid-js';

type Point = [number, number];

export function PatternMotif(props: {
  points: Point[];
  onChange: (points: Point[]) => void;
  label: string;
  clear: string;
}) {
  const [stroke, setStroke] = createSignal<Point[]>();
  let pointer: number | undefined;
  const point = (event: PointerEvent & { currentTarget: SVGSVGElement }): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    const bounded = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    return [
      bounded((event.clientX - box.x) / box.width),
      bounded((event.clientY - box.y) / box.height),
    ];
  };
  return (
    <div class="pattern-motif">
      <svg
        class="checkpoint-map"
        viewBox="0 0 1 1"
        role="img"
        aria-label={props.label}
        onPointerDown={(e) => {
          if (pointer !== undefined || e.button !== 0) return;
          pointer = e.pointerId;
          e.currentTarget.setPointerCapture(pointer);
          setStroke([point(e)]);
        }}
        onPointerMove={(e) => {
          const points = stroke();
          if (e.pointerId !== pointer || !points || points.length >= 127) return;
          setStroke([...points, point(e)]);
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== pointer) return;
          props.onChange([...(stroke() ?? []), point(e)]);
          setStroke(undefined);
          pointer = undefined;
        }}
        onLostPointerCapture={() => {
          setStroke(undefined);
          pointer = undefined;
        }}
      >
        <polyline
          points={(stroke() ?? props.points).map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="currentColor"
          stroke-width="0.02"
        />
      </svg>
      <button
        type="button"
        class="secondary"
        disabled={!props.points.length}
        onClick={() => props.onChange([])}
      >
        {props.clear}
      </button>
    </div>
  );
}
