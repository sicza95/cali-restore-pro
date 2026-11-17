import { describe, expect, it } from 'vitest';
import { backupRecords } from '../../../tests-platform/fixtures/backup-records';
import { summary } from '../estimates/snapshots';
import { reportBlocks, reportTable } from '../reports/export-rows';
import { recipientExportDraft } from './export-draft';
import { parseRecipientReport } from './persistence';
import { authorRecipientReport, availableFinances, estimateAt, grantFinances } from './scope';
import type { RecipientGrant, RecipientReportSettings, SharedSource } from './types';

const project = '00000000-0000-4000-8000-0000000000c1';
const invitation = '00000000-0000-4000-8000-0000000000c2';
const sender = '00000000-0000-4000-8000-0000000000c3';
const issued = backupRecords(project).estimate.snapshots[0]!;
const full = {
  scope: 'estimate-full' as const,
  text: JSON.stringify({
    schema: 1,
    scope: 'estimate-full',
    snapshot: issued,
    freshness: 'current',
  }),
};
const totals = { scope: 'estimate-summary' as const, text: JSON.stringify(summary(issued, 7)) };
const shared: SharedSource['project'] = {
  name: 'Synthetic chapel',
  revision: 7,
  objects: [
    {
      name: 'North wall',
      surfaces: [
        { name: 'Upper plaster', units: 'metric' },
        { name: 'Lower plaster', units: 'imperial' },
      ],
    },
  ],
};
const grant = (estimateScope: RecipientGrant['estimateScope']): RecipientGrant => ({
  invitation,
  project,
  state: 'active',
  estimateScope,
});
const settings = (finances: RecipientReportSettings['finances']): RecipientReportSettings => ({
  language: 'en',
  notes: 'My notes',
  excluded: [],
  finances,
  format: 'XLSX',
});
const at = '2026-11-17T10:00:00.000Z';
const money = (text: string) => /\b(HUF|EUR)\b|subtotal|total/i.test(text);

describe('recipient report grant filtering', () => {
  it('offers estimate levels only as far as the grant goes', () => {
    expect(grantFinances(grant('none'))).toEqual(['none']);
    expect(grantFinances(grant('estimate-summary'))).toEqual(['none', 'summary']);
    expect(grantFinances(grant('estimate-full'))).toEqual(['none', 'summary', 'full']);
    expect(grantFinances({ ...grant('estimate-full'), state: 'accepted' })).toEqual(['none']);
    const opened = { sender, project: shared, estimate: full };
    expect(availableFinances(grant('estimate-full'), opened)).toEqual(['none', 'summary', 'full']);
    expect(availableFinances(grant('estimate-full'), { sender, project: shared })).toEqual([
      'none',
    ]);
    expect(availableFinances(grant('estimate-summary'), { ...opened, estimate: totals })).toEqual([
      'none',
      'summary',
    ]);
  });

  it('gives an assessment-only recipient no estimate figures, even from stale content', () => {
    const report = authorRecipientReport(
      grant('none'),
      { sender, project: shared, estimate: full },
      settings('full'),
      at,
    );
    expect(report.estimate).toBeUndefined();
    expect(report.settings.finances).toBe('none');
    expect(JSON.stringify(report)).not.toContain(issued.id);
    const draft = recipientExportDraft(report);
    expect(draft.estimate).toBeUndefined();
    const rows = reportTable(draft).flat().map(String);
    expect(rows.some(money)).toBe(false);
    expect(rows).toContain('Recipient draft from shared content. Not issued by the project owner.');
  });

  it('keeps a summary grant to totals and narrows a full grant to the chosen level', () => {
    const fromSummary = authorRecipientReport(
      grant('estimate-summary'),
      { sender, project: shared, estimate: totals },
      settings('full'),
      at,
    );
    expect(fromSummary.settings.finances).toBe('none');
    const summaryOnly = authorRecipientReport(
      grant('estimate-summary'),
      { sender, project: shared, estimate: full },
      settings('summary'),
      at,
    );
    expect(summaryOnly.estimate?.scope).toBe('estimate-summary');
    expect(summaryOnly.estimate?.text).not.toContain('"phases"');
    expect(recipientExportDraft(summaryOnly).estimate?.detail).toBeUndefined();
    const whole = authorRecipientReport(
      grant('estimate-full'),
      { sender, project: shared, estimate: full },
      settings('full'),
      at,
    );
    expect(whole.estimate).toEqual(full);
    expect(recipientExportDraft(whole).estimate?.detail?.phases.length).toBeGreaterThan(0);
    expect(estimateAt(totals, 'full', project, 7)).toBeUndefined();
  });

  it('refuses authoring without an active grant and drops unknown surfaces', () => {
    expect(() =>
      authorRecipientReport(
        { ...grant('estimate-full'), state: 'pending' },
        { sender, project: shared },
        settings('none'),
        at,
      ),
    ).toThrow();
    const report = authorRecipientReport(
      grant('none'),
      { sender, project: shared },
      { ...settings('none'), excluded: ['0/1', '0/1', '4/0'] },
      at,
    );
    expect(report.settings.excluded).toEqual(['0/1']);
    const draft = recipientExportDraft(report);
    expect(draft.surfaces.map(({ name, unit }) => [name, unit])).toEqual([['Upper plaster', 'm²']]);
    expect(draft.recipient).toBe(true);
    expect(reportBlocks(draft)[0]!.heading).toBe('Synthetic chapel');
  });

  it('validates a stored draft against its key and its estimate level', () => {
    const report = authorRecipientReport(
      grant('estimate-full'),
      { sender, project: shared, estimate: full },
      settings('summary'),
      at,
    );
    const text = JSON.stringify(report);
    expect(parseRecipientReport(text, { project, invitation })).toEqual(report);
    expect(() => parseRecipientReport(text, { project, invitation: sender })).toThrow();
    const forged = { ...report, settings: { ...report.settings, finances: 'full' } };
    expect(() => parseRecipientReport(JSON.stringify(forged), { project, invitation })).toThrow();
    const unlabelled = { ...report, estimate: undefined };
    expect(() =>
      parseRecipientReport(JSON.stringify(unlabelled), { project, invitation }),
    ).toThrow();
  });
});
