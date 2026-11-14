export type Point = readonly [number, number];
export type Bounds = readonly [left: number, top: number, width: number, height: number];
export type Matrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Ring = readonly Point[];
// Closed paths use nonzero winding. Oppositely oriented paths cut holes.
export type Mask = readonly Ring[];
export type PathSegment = { to: Point } | { to: Point; controls: readonly [Point, Point] };
export type MaskLayer = { id: string; kind: 'damage' | 'phase'; parent?: string; mask: Mask };
export type Category = { id: string; parent?: string };
export type SourceFrame = {
  id: string;
  width: number;
  height: number;
  embeddedPreview: boolean;
};
export type Preparation = {
  crop: Bounds;
  rotation: number;
  skew: number;
  flip: boolean;
  perspective: number;
  rectify: boolean;
};
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type CalibrationInput = {
  unit: LengthUnit;
  width: number;
  height: number;
} & (
  | { method: 'dimensions' }
  | { method: 'lines'; horizontal: readonly [Point, Point]; vertical: readonly [Point, Point] }
);
export type Calibration = {
  revision: number;
  frameRevision: number;
  input: CalibrationInput;
};
export type AlignmentInput =
  | { method: 'reference' }
  | {
      method: 'manual' | 'automatic';
      pairs: readonly { detail: Point; reference: Point }[];
      offset: Point;
      usable: Bounds;
    };
export type Alignment = {
  frameRevision: number;
  preparationRevision: number;
  canonical?: Matrix;
  source: SourceFrame;
  input: AlignmentInput;
};
export type PhotoPreparation = { source: SourceFrame; revision: number; input: Preparation };
export type PlanarSurface = {
  version: 1;
  revision: number;
  source: SourceFrame;
  frame: PhotoPreparation;
  calibration?: Calibration;
  details: PhotoPreparation[];
  alignments: Alignment[];
  master?: Mask;
  layers: MaskLayer[];
  categories: Category[];
};
