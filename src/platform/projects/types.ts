import type { AssessmentCheckpoint } from './assessment-checkpoints';
import type { PlanarSurface } from './planar-types';
import type {
  CoverReference,
  EntityMetadata,
  EntityOverrides,
  ProjectAsset,
  ProjectOverrides,
} from './browser-contracts';
export type Units = 'metric' | 'imperial';
export type ImageRole = 'mapping' | 'reference';
export type Attachment = { id: string; role: ImageRole };
/** Metadata is optional only for legacy v1 documents; v2 is checked at the boundary. */
export type Surface = Partial<EntityMetadata> & {
  id: string;
  name: string;
  units: Units | null;
  archived?: boolean;
  images: Attachment[];
  assessments?: PlanarSurface[];
  checkpoints?: AssessmentCheckpoint[];
  cover?: CoverReference;
  overrides?: EntityOverrides;
};
export type RestorationObject = Partial<EntityMetadata> & {
  id: string;
  name: string;
  units: Units | null;
  archived?: boolean;
  surfaces: Surface[];
  cover?: CoverReference;
  overrides?: EntityOverrides;
};
export type Project = Partial<EntityMetadata> & {
  version: 1 | 2;
  id: string;
  name: string;
  archived: boolean;
  /** The organisation the project belongs to; none means the account's personal one. */
  organisation?: string;
  updatedAt: number;
  settings: { version: 1; units: Units; currency: string };
  objects: RestorationObject[];
  cover?: CoverReference;
  overrides?: ProjectOverrides;
  assets?: ProjectAsset[];
};
export type SavedProject = Project & { revision: number };
export type SurfaceV2 = Surface & EntityMetadata;
export type RestorationObjectV2 = RestorationObject & EntityMetadata & { surfaces: SurfaceV2[] };
export type ProjectV2 = Project & EntityMetadata & { version: 2; objects: RestorationObjectV2[] };
export type SavedProjectV2 = ProjectV2 & { revision: number };
