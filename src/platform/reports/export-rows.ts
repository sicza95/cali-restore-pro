import { assessmentBlock } from './assessment-rows';
import type { AssessmentMap } from './assessment-map';
import { reportCopy } from './copy';
import { estimateCopy } from '../estimates/copy';
import type { Draft } from './types';

export type Cell = string | number | null;
export type Row = [section: string, item: string, value: Cell, unit?: string];
export type Block = {
  heading: string;
  rows: Row[];
  map?: AssessmentMap;
  photos?: { label: string; url: string }[];
};
const value = (text: string | null | undefined) =>
  text == null ? null : Number(text.replace(',', '.'));

export function reportBlocks(draft: Draft): Block[] {
  const c = reportCopy[draft.language];
  const e = estimateCopy[draft.language];
  const b = draft.branding;
  const project = draft.project;
  const blocks: Block[] = [
    {
      heading: project.name,
      rows: [
        [c.title, c.project, project.name],
        [c.title, c.projectRevision, project.revision],
        [c.title, c.projectDate, new Date(project.updatedAt).toISOString()],
        ...(b
          ? (
              [
                [c.branding, c.studio, b.studio],
                [c.branding, c.contact, b.contact],
              ] satisfies Row[]
            ).filter((row) => row[2])
          : []),
      ],
    },
  ];
  for (const surface of draft.surfaces) {
    blocks.push(assessmentBlock(draft, surface, surface.version, false));
    if (surface.compare) blocks.push(assessmentBlock(draft, surface, surface.compare, true));
  }
  if (draft.notes.trim()) blocks.push({ heading: c.notes, rows: [[c.notes, '', draft.notes]] });
  if (draft.estimateState)
    blocks.push({
      heading: c.finances,
      rows: [
        [
          c.finances,
          c.status,
          draft.estimateState === 'outsideScope' ? c.outsideScope : c.noEstimate,
        ],
      ],
    });
  if (draft.estimate) {
    const { summary, detail, unknownFreshness } = draft.estimate;
    const rows: Row[] = [
      [c.finances, c.estimateVersion, summary.version],
      [c.finances, c.projectRevision, summary.projectRevision],
      [c.finances, c.estimateDate, summary.createdAt],
      [c.finances, c.calculation, summary.calculation],
      [c.finances, e.currency, summary.currency],
      [
        c.finances,
        c.status,
        unknownFreshness
          ? c.unknownFreshness
          : summary.freshness === 'stale'
            ? c.staleEstimate
            : c.currentEstimate,
      ],
    ];
    if (summary.illustrative) rows.push([c.finances, c.status, c.sample]);
    const money = (label: string, amount: string | null) =>
      rows.push([c.finances, label, value(amount), summary.currency]);
    summary.objects.forEach(({ name, subtotal }) => money(name, subtotal));
    money(e.extras, summary.extras);
    summary.adjustments.forEach(({ amount }, index) =>
      money(e.adjustments + ' ' + (index + 1), amount),
    );
    money(e.beforeTax, summary.beforeTax);
    money(e.taxTotal, summary.taxTotal);
    money(c.estimateTotal, summary.total);
    if (detail && draft.workbook !== 'editable')
      rows.push([c.finances, e.hours, value(detail.hours), 'h']);
    blocks.push({ heading: c.finances + ' · ' + (detail ? c.full : c.summary), rows });
    if (draft.workbook !== 'editable')
      for (const phase of detail?.phases ?? []) {
        const surface = draft.surfaces.find(({ id }) => id === phase.surface);
        const heading = [surface?.object, surface?.name, phase.name].filter(Boolean).join(' / ');
        const currency = summary.currency;
        const assessment =
          phase.assessment === 'current'
            ? c.current
            : surface?.assessments?.find(({ id }) => id === phase.assessment)?.name;
        blocks.push({
          heading,
          rows: [
            ...(assessment ? [[heading, c.version, assessment] satisfies Row] : []),
            [heading, e.hours, value(phase.hours), 'h'],
            [
              heading,
              e.rate,
              value(phase.rate),
              currency +
                (phase.method === 'area'
                  ? '/' + phase.unit
                  : phase.method === 'hourly'
                    ? '/h'
                    : ''),
            ],
            [heading, c.workPrice, value(phase.work), currency],
            [heading, e.material, value(phase.material), currency],
            [heading, e.subtotal, value(phase.subtotal), currency],
          ],
        });
      }
  }
  if (b?.footer) blocks.push({ heading: '', rows: [[c.branding, c.footer, b.footer]] });
  return blocks;
}

export function reportTable(draft: Draft): Cell[][] {
  const c = reportCopy[draft.language];
  return [
    [c.title, '', c.exportNote, ''],
    [c.section, c.item, c.value, c.unit],
    ...reportBlocks(draft).flatMap(({ rows }) =>
      rows.map(([section, item, value, unit]) => [section, item, value, unit ?? '']),
    ),
  ];
}
