import type {
  AssetReference,
  BrowserItemKind,
  EntityOverrides,
  ProjectOverrides,
} from '../../../platform/projects/browser-contracts';
import type { ResolvedSettings } from '../../../platform/projects/settings';
import type { Language } from '../../../platform/i18n/language';

export type OverridesSectionProps = {
  language: Language;
  level: BrowserItemKind;
  projectId: string;
  objectId?: string;
  surfaceId?: string;
  effective: ResolvedSettings;
  overrides: EntityOverrides | ProjectOverrides;
  disabled?: boolean;
  onChange: (overrides: ProjectOverrides | EntityOverrides) => void;
};
export type BrandingOverridesSectionProps = OverridesSectionProps & {
  /** Undefined cancels; null explicitly clears. The host imports/registers the selected asset. */
  onPickLogo: () => Promise<AssetReference | null | undefined>;
};
