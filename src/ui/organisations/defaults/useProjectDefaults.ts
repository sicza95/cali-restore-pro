import type { Project } from '../../../platform/projects/types';
import { useApp } from '../../app-context/AppContext';
import { loadPreferences } from '../../settings/preferences/utils';
import { useOrganisations } from '../organisation-state';
import { defaultsRoot, organisationDefaults } from './model';

/** Resolve against the project's organisation, never the organisation selected in the top bar. */
export function useProjectDefaults(
  project: () => Pick<Project, 'organisation'>,
  account?: () => string,
) {
  const app = useApp();
  const orgs = useOrganisations();
  const read = () => {
    const who = account?.() ?? app.account()?.id;
    const org = project().organisation;
    const organisation = orgs.list().find((entry) => (org ? entry.id === org : entry.personal));
    // Legacy projects with no organisation are Personal, including while offline before list load.
    const defaults = organisationDefaults(
      organisation ?? (!org ? { personal: true } : undefined),
      who,
    );
    return defaultsRoot(defaults, who ? loadPreferences(who).snap === true : false);
  };
  return Object.assign(read, { ready: () => (orgs.loaded() ? Promise.resolve() : orgs.refresh()) });
}
