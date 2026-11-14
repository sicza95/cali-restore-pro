import type { AssessmentMap } from './assessment-map';
import type { Tile } from '../projects/patterns';
import { tileShape } from './map-svg';

function pattern(context: OffscreenCanvasRenderingContext2D, color: string, tile?: Tile) {
  const spacing = tile?.spacing ?? 10;
  const canvas = new OffscreenCanvas(Math.ceil(spacing * 4), Math.ceil(spacing * 4));
  const ink = canvas.getContext('2d')!;
  const scale = canvas.width / spacing;
  ink.scale(scale, scale);
  ink.strokeStyle = ink.fillStyle = tile?.color ?? color;
  ink.lineWidth = tile?.weight ?? 2.5;
  const shape = tile ? tileShape(tile) : { path: 'M0 0L10 10' };
  if (shape.path) ink.stroke(new Path2D(shape.path));
  if (shape.dot) {
    ink.beginPath();
    ink.arc(spacing / 2, spacing / 2, shape.dot, 0, Math.PI * 2);
    ink.fill();
  }
  if (shape.text && tile) {
    ink.font = shape.text + 'px Arial, sans-serif';
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.fillText(tile.motif, spacing / 2, spacing / 2);
  }
  const repeat = context.createPattern(canvas, 'repeat')!;
  const size = (tile ? 0.42 : 1) / scale;
  repeat.setTransform(new DOMMatrix().scale(size).rotate(tile?.angle ?? 0));
  return repeat;
}

export function paintMap(
  context: OffscreenCanvasRenderingContext2D,
  map: AssessmentMap,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const ratio = Math.min(width / map.width, height / map.height);
  context.save();
  context.translate(x, y + (height - map.height * ratio) / 2);
  context.scale(ratio, ratio);
  context.fillStyle = '#dbd1bc';
  context.fill(new Path2D(map.assessed));
  for (const paint of map.paints) {
    const path = new Path2D(paint.path);
    context.globalAlpha = paint.opacity;
    if (paint.fill !== 'none') {
      context.fillStyle =
        paint.fill === 'solid' ? paint.color : pattern(context, paint.color, paint.tile);
      context.fill(path);
    }
    if (paint.outline) {
      context.strokeStyle = paint.color;
      context.stroke(path);
    }
  }
  context.restore();
}
