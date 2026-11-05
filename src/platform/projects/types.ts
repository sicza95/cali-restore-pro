export type Units = 'metric' | 'imperial';
export type ImageRole = 'mapping' | 'reference';
export type Attachment = { id: string; role: ImageRole };
export type Surface = { id: string; name: string; units: Units | null; images: Attachment[] };
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
  updatedAt: number;
  settings: { version: 1; units: Units; currency: string };
  objects: RestorationObject[];
};
export type SavedProject = Project & { revision: number };
