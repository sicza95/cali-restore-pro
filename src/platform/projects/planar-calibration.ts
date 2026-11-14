import { inside, polygonBounds, preparationMatrix, project, rect } from './planar-transform';
import type { CalibrationInput, LengthUnit, PhotoPreparation } from './planar-types';

export const metres: Record<LengthUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
  ft: 0.3048,
};

export function calibrationScale(frame: PhotoPreparation, input: CalibrationInput) {
  if (
    !Object.hasOwn(metres, input.unit) ||
    ![input.width, input.height].every((v) => Number.isFinite(v) && v > 0)
  )
    throw new Error('Both calibration lengths are required');
  const matrix = preparationMatrix(frame.source, frame.input);
  const crop = frame.input.crop;
  const [, , width, height] = polygonBounds(rect(crop).map((p) => project(matrix, p)));
  let spans: readonly [number, number] = [width, height];
  if (input.method === 'lines') {
    if (![...input.horizontal, ...input.vertical].every((p) => inside(p, crop)))
      throw new Error('Calibration endpoints must lie inside the crop');
    const [a, b] = input.horizontal.map((p) => project(matrix, p));
    const [c, d] = input.vertical.map((p) => project(matrix, p));
    spans = [Math.abs(b![0] - a![0]), Math.abs(d![1] - c![1])];
  } else if (input.method !== 'dimensions') throw new Error('Unknown calibration method');
  if (spans[0] <= 1e-9 * width || spans[1] <= 1e-9 * height)
    throw new Error('Calibration axis has no span');
  const factor = metres[input.unit];
  const scale = [(input.width * factor) / spans[0], (input.height * factor) / spans[1]] as const;
  if (
    !scale.every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(scale[0] * scale[1]) ||
    scale[0] * scale[1] === 0
  )
    throw new Error('Calibration exceeds numeric range');
  return scale;
}
