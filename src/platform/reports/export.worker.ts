import { reportTable } from './export-rows';
import { reportCopy } from './copy';
import { visualExport } from './export-visual';
import { estimateSheets } from './export-editable';
import { xlsx } from './export-xlsx';
import type { Draft } from './types';
import type { Cell } from './export-rows';

function csv(rows: Cell[][]) {
  const cell = (value: Cell) => {
    if (value === null) return '';
    if (typeof value === 'number') return String(value);
    // Spreadsheet imports can trim leading control characters before interpreting a formula.
    // eslint-disable-next-line no-control-regex
    const safe = /^[\s\u0000-\u001f\u007f\ufeff]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(value)
      ? "'" + value
      : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return new Blob(['\uFEFF', rows.map((row) => row.map(cell).join(',')).join('\r\n'), '\r\n'], {
    type: 'text/csv;charset=utf-8',
  });
}

async function encode(draft: Draft) {
  if (!draft.surfaces.length) throw new Error('Report selection required');
  if (draft.format === 'CSV') return csv(reportTable(draft));
  if (draft.format === 'XLSX') {
    const sheets = [
      {
        name: draft.language === 'hu' ? 'Jelentés' : 'Report',
        rows: reportTable(draft),
        widths: [50, 36, 54, 20],
      },
    ];
    if (draft.workbook === 'editable') {
      if (!draft.workbookEstimate || !draft.estimate?.detail)
        throw new Error('Full scope required');
      const c = reportCopy[draft.language];
      sheets[0]!.rows[0]!.push(c.snapshot);
      return xlsx([...sheets, ...estimateSheets(draft, draft.workbookEstimate)]);
    }
    return xlsx(sheets);
  }
  return visualExport(draft);
}

self.onmessage = async ({ data }: MessageEvent<Draft>) => {
  try {
    self.postMessage(await encode(data));
  } catch {
    self.postMessage(null);
  }
};
