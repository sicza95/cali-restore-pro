import type { AssessmentCheckpoint } from './assessment-checkpoints';
import type { PlanarSurface } from './planar-types';
export type Units = 'metric' | 'imperial';
export type ImageRole = 'mapping' | 'reference';
export type Attachment = { id: string; role: ImageRole };
export type Surface = {
  id: string;
  name: string;
  units: Units | null;
  images: Attachment[];
  assessments?: PlanarSurface[];
  checkpoints?: AssessmentCheckpoint[];
};
export type RestorationObject = {
  id: string;
  name: string;
  units: Units | null;
  surfaces: Surface[];
};
export type Project = {
  version: 1;
  id: string;
  name: string;
  archived: boolean;
  /** The organisation the project belongs to; none means the account's personal one. */
  organisation?: string;
  updatedAt: number;
  settings: { version: 1; units: Units; currency: string };
  objects: RestorationObject[];
};
export type SavedProject = Project & { revision: number };
