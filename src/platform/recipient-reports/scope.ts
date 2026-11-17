import { summary } from '../estimates/snapshots';
import { parseEstimateScope } from '../estimates/scopes';
import type { FullEstimateScope } from '../reports/estimate';
import type {
  RecipientEstimate,
  RecipientFinances,
  RecipientGrant,
  RecipientReport,
  RecipientReportSettings,
  SharedSource,
} from './types';

/** The estimate levels a grant lets its recipient put in their own report. */
export function grantFinances(grant: RecipientGrant): RecipientFinances[] {
  if (grant.state !== 'active') return ['none'];
  if (grant.estimateScope === 'estimate-full') return ['none', 'summary', 'full'];
  if (grant.estimateScope === 'estimate-summary') return ['none', 'summary'];
  return ['none'];
}

/**
 * The opened estimate reduced to one level, or undefined when that level is not available from
 * it: a summary can come from a summary or a full grant, the full estimate only from a full one.
 */
export function estimateAt(
  estimate: RecipientEstimate | undefined,
  finances: RecipientFinances,
  project: string,
  revision: number,
): RecipientEstimate | undefined {
  if (!estimate || finances === 'none') return;
  if (finances === 'full') return estimate.scope === 'estimate-full' ? estimate : undefined;
  if (estimate.scope === 'estimate-summary') return estimate;
  const full = JSON.parse(estimate.text) as FullEstimateScope;
  const totals = summary(full.snapshot, revision);
  if (full.freshness === 'stale') totals.freshness = 'stale';
  const [text] = parseEstimateScope('estimate-summary', JSON.stringify(totals), project) ?? [];
  if (!text) throw new Error('Invalid summary');
  return { scope: 'estimate-summary', text };
}

/** The estimate levels the recipient can choose now: granted and opened. */
export function availableFinances(grant: RecipientGrant, source: SharedSource) {
  return grantFinances(grant).filter(
    (level) =>
      level === 'none' ||
      estimateAt(source.estimate, level, grant.project, source.project.revision) !== undefined,
  );
}

export const surfaceKeys = (source: SharedSource['project']) =>
  source.objects.flatMap((object, o) => object.surfaces.map((_, s) => `${o}/${s}`));

/**
 * Builds the recipient's report from what their active grant allows. Anything outside it is
 * dropped: estimate figures need an estimate grant, the full estimate a full grant, and a report
 * without an estimate grant carries no estimate data at all.
 */
export function authorRecipientReport(
  grant: RecipientGrant,
  source: SharedSource,
  settings: RecipientReportSettings,
  savedAt: string,
): RecipientReport {
  if (grant.state !== 'active') throw new Error('Shared access is not active');
  const keys = surfaceKeys(source.project);
  const finances = availableFinances(grant, source).includes(settings.finances)
    ? settings.finances
    : 'none';
  const estimate = estimateAt(source.estimate, finances, grant.project, source.project.revision);
  return {
    schema: 1,
    kind: 'recipient-draft',
    project: grant.project,
    invitation: grant.invitation,
    sender: source.sender,
    savedAt,
    source: structuredClone(source.project),
    ...(estimate ? { estimate } : {}),
    settings: {
      language: settings.language,
      notes: settings.notes,
      excluded: settings.excluded.filter(
        (key, index, all) => keys.includes(key) && all.indexOf(key) === index,
      ),
      finances: estimate ? finances : 'none',
      format: settings.format,
    },
  };
}
