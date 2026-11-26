import type { AreaUnit } from '../../estimates/types';
import type {
  AssetReference,
  BrowserItemKind,
  ReportBranding,
  RestorationDefaults,
} from '../browser-contracts';

export type SettingsSource = 'account' | BrowserItemKind;
export type ResolvedField<T> = { value: T; source: SettingsSource };
export type ResolvedFields<T> = { [K in keyof T]: ResolvedField<T[K]> };
/** Browser-local account logos never become project asset references. */
export type AccountLogo = { accountDataUrl: string };
export type EffectiveBranding = Omit<ReportBranding, 'logo'> & {
  logo: AssetReference | AccountLogo | null;
};
/**
 * The account root. `areaUnit: null` means the account never chose one: the area unit then
 * follows the resolved measurement system (metric → m², imperial → ft²), as before overrides.
 */
export type AccountSettings = {
  restoration: Omit<RestorationDefaults, 'areaUnit'> & { areaUnit: AreaUnit | null };
  branding: EffectiveBranding;
};
export type ResolvedSettings = {
  restoration: ResolvedFields<RestorationDefaults>;
  branding: ResolvedFields<EffectiveBranding>;
};
/** Omit both child IDs for project-wide settings. A surface requires its owning object. */
export type SettingsTarget = { objectId?: string; surfaceId?: string };
