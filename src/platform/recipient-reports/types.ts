import type { EstimateScope } from '../projects/sharing-scopes';
import type { SharedProject } from '../projects/shared-project';

/** How much of a shared estimate a recipient report carries. */
export type RecipientFinances = 'none' | 'summary' | 'full';
export const recipientFormats = ['PDF', 'XLSX'] as const;
export type RecipientFormat = (typeof recipientFormats)[number];

/** An opened estimate grant, as `parseEstimateScope` returns it (one JSON row). */
export type RecipientEstimate = { scope: Exclude<EstimateScope, 'none'>; text: string };

/** What the recipient's inbox knows about one grant. */
export type RecipientGrant = {
  invitation: string;
  project: string;
  state: 'pending' | 'accepted' | 'active';
  estimateScope: EstimateScope;
};

/** Content the recipient opened from that grant in this session. */
export type SharedSource = {
  sender: string;
  project: SharedProject;
  estimate?: RecipientEstimate;
};

export type RecipientReportSettings = {
  language: 'en' | 'hu';
  notes: string;
  /** Surface keys (`object/surface` positions in the shared snapshot) left out of the report. */
  excluded: string[];
  finances: RecipientFinances;
  format: RecipientFormat;
};

/**
 * A recipient's own report draft (ADR 0008). It is always a draft, holds only content its grant
 * allowed when it was saved, and lives in the recipient's vault, never the owner's.
 */
export type RecipientReport = {
  schema: 1;
  kind: 'recipient-draft';
  project: string;
  invitation: string;
  sender: string;
  savedAt: string;
  source: SharedProject;
  /** Present only when `settings.finances` is not `none`, at exactly that level. */
  estimate?: RecipientEstimate;
  settings: RecipientReportSettings;
};
