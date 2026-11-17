import { registerPlatformControls } from '../account-access/register-platform-controls';

/** Controls of a recipient's own report drafts from shared projects (ADR 0008). */
export const recipientReportControls = registerPlatformControls(
  {
    composition: 'Recipient reports',
    owner: 'M-10',
    permission: 'Invited recipient with an unlocked vault; authoring needs an active grant',
    valueSource: 'Opened grant content and the recipient vault’s own report drafts',
    helpKey: 'help',
    unavailable: {
      failure: 'Keep the saved draft and show a retryable error.',
      empty: 'Show that no recipient report is saved yet.',
      locked: 'Hide drafts and opened shared content.',
    },
  },
  [
    [
      'recipient-report.author',
      'author',
      'Open the recipient report form',
      'Opened shared project',
    ],
    ['recipient-report.notes', 'notes', 'Edit the recipient report notes', 'Opened shared project'],
    [
      'recipient-report.finances',
      'finances',
      'Choose estimate figures allowed by the grant',
      'Opened shared project; levels need an opened estimate grant',
    ],
    [
      'recipient-report.language',
      'language',
      'Choose the report language',
      'Opened shared project',
    ],
    ['recipient-report.format', 'format', 'Choose PDF or XLSX', 'Opened shared project'],
    [
      'recipient-report.save',
      'save',
      'Save the recipient draft in the recipient vault',
      'Active grant and at least one surface',
    ],
    [
      'recipient-report.download',
      'download',
      'Export the recipient draft, labelled as such',
      'Saved recipient draft, also after revocation',
    ],
    [
      'recipient-report.remove',
      'remove',
      'Delete the recipient draft from this device',
      'Saved recipient draft, with confirmation',
    ],
  ],
);
