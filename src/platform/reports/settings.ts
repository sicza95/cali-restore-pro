import type { Project } from '../projects/types';
import { resolveSettings, type AccountSettings, type SettingsTarget } from '../projects/settings';
import type { Branding, ReportSettings } from './types';

/** An explicit target, never inferred from an arbitrary first selected surface. */
export function reportDefaults(
  account: AccountSettings,
  project: Project,
  target: SettingsTarget = {},
) {
  return resolveSettings(account, project, target);
}

/** Issued branding is a snapshot; defaults and report overrides cannot rewrite it. */
export async function resolveReportBranding(
  account: AccountSettings,
  project: Project,
  settings: Pick<ReportSettings, 'brandingSource' | 'branding'>,
  target: SettingsTarget = {},
  loadLogo?: (assetId: string) => Promise<string>,
  issued = false,
): Promise<Branding | undefined> {
  if (issued) return settings.branding ? structuredClone(settings.branding) : undefined;
  if (settings.brandingSource === 'omit') return;
  if (settings.brandingSource === 'override' && settings.branding)
    return structuredClone(settings.branding);
  const fields = reportDefaults(account, project, target).branding;
  const logo = fields.logo.value;
  let image = '';
  if (logo && 'accountDataUrl' in logo) image = logo.accountDataUrl;
  else if (logo) {
    if (
      !loadLogo ||
      !project.assets?.some(({ id, purpose }) => id === logo.assetId && purpose === 'branding')
    )
      throw new Error('Report logo asset unavailable');
    image = await loadLogo(logo.assetId);
  }
  return {
    studio: fields.studio.value,
    contact: fields.contact.value,
    footer: fields.footer.value,
    accent: fields.accent.value,
    logo: image,
  };
}
