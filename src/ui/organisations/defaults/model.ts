import type { OrganisationDefaults, OrganisationSummary } from '../../../platform/api';
import type { AccountSettings } from '../../../platform/projects/settings';
import { loadAccountSettings } from '../../settings/preferences/utils';

export function organisationDefaults(
  organisation: Pick<OrganisationSummary, 'personal' | 'defaults'> | undefined,
  account?: string,
): OrganisationDefaults {
  // Old account-wide values migrate only to Personal; shared organisations start independently.
  const legacy = loadAccountSettings(organisation?.personal ? account : undefined);
  return (
    organisation?.defaults ?? {
      restoration: {
        units: legacy.restoration.units,
        areaUnit: legacy.restoration.areaUnit,
        currency: legacy.restoration.currency,
        reportLanguage: legacy.restoration.reportLanguage,
      },
      branding: {
        ...legacy.branding,
        logo:
          legacy.branding.logo && 'accountDataUrl' in legacy.branding.logo
            ? legacy.branding.logo.accountDataUrl
            : '',
      },
    }
  );
}

export function defaultsRoot(defaults: OrganisationDefaults, snap: boolean): AccountSettings {
  const base = loadAccountSettings();
  return {
    ...base,
    restoration: { ...base.restoration, snap },
    organisation: {
      restoration: defaults.restoration,
      branding: {
        ...defaults.branding,
        logo: defaults.branding.logo ? { accountDataUrl: defaults.branding.logo } : null,
      },
    },
  };
}
