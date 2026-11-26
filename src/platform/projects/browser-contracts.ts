import type { AreaUnit } from '../estimates/types';
import type { Language } from '../i18n/language';
import type { Units } from './types';

export const projectVisibilities = ['private', 'listed'] as const;
export type ProjectVisibility = (typeof projectVisibilities)[number];
export const browserItemKinds = ['project', 'object', 'surface'] as const;
export type BrowserItemKind = (typeof browserItemKinds)[number];
export const browserItemStatuses = [
  'local',
  'paused',
  'remote',
  'synced',
  'pending',
  'conflict',
  'error',
  'unknown',
] as const;
export type BrowserItemStatus = (typeof browserItemStatuses)[number];

/** Epoch milliseconds; null means history is unknown, never a fabricated date. */
export type EntityMetadata = {
  createdAt: number | null;
  updatedAt: number | null;
  /** Account UUID of the creator, independent of current project ownership. */
  createdBy: string | null;
};

/** Vault file UUID, never a URL, data URL or image bytes. */
export type AssetReference = { assetId: string };
export type CoverReference = AssetReference;
/** Dedicated files not already represented by a surface attachment. */
export type ProjectAsset = { id: string; purpose: 'cover' | 'branding' };

export type RestorationDefaults = {
  /** Measurement system; distinct from the unit used to display an area. */
  units: Units;
  areaUnit: AreaUnit;
  currency: string;
  reportLanguage: Language;
  snap: boolean;
};
/** Omitted fields inherit. Currency may only be overridden on a project. */
export type RestorationOverrides = Partial<Omit<RestorationDefaults, 'currency'>>;
export type ProjectRestorationOverrides = Partial<RestorationDefaults>;
export type ReportBranding = {
  studio: string;
  contact: string;
  footer: string;
  accent: string;
  /** Null explicitly clears an inherited logo; omission in overrides inherits. */
  logo: AssetReference | null;
};
/** Empty text explicitly clears inherited text. */
export type ReportBrandingOverrides = Partial<ReportBranding>;
export type EntityOverrides = {
  restoration?: RestorationOverrides;
  branding?: ReportBrandingOverrides;
};
export type ProjectOverrides = Omit<EntityOverrides, 'restoration'> & {
  restoration?: ProjectRestorationOverrides;
};

export type BrowserOwner = { id: string; name: string };
/** `empty`: the item has no photos, so there are no originals to keep offline. */
export type BrowserOriginalAvailability = 'none' | 'partial' | 'all' | 'unknown' | 'empty';
/** Projection only: ownership, visibility and status do not belong in project JSON. */
export type BrowserItemDescriptor = EntityMetadata & {
  id: string;
  kind: BrowserItemKind;
  projectId: string;
  /** Required by adapters for objects and surfaces; absent on project entries. */
  objectId?: string;
  name: string;
  organisation: string | null;
  owners: BrowserOwner[];
  cover?: CoverReference;
  childCount: number | null;
  /** Children inherit the project's document status, not an independent checkpoint. */
  hosted?: boolean;
  status: BrowserItemStatus;
  originals: BrowserOriginalAvailability;
  visibility: ProjectVisibility;
  /** Directory cards are remote-only, not openable, and expose only name + owners. */
  access: 'editable' | 'read-only' | 'directory';
};
