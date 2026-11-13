import { zip } from './export-zip';
import { xml } from './export-bytes';
import type { Cell } from './export-rows';

export type Formula = { expression: string; cache: number | null };
export type Sheet = { name: string; rows: (Cell | Formula)[][]; widths: number[] };
const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const rel = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="${relationships}/${type}" Target="${target}"/>`;

function column(index: number) {
  return String.fromCharCode(65 + index);
}
function sheetXml({ rows, widths }: Sheet) {
  const body = rows
    .map((row, i) => {
      const cells = row
        .map((value, j) => {
          if (value === null) return '';
          const ref = column(j) + (i + 1);
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
          if (typeof value === 'object')
            return `<c r="${ref}"${value.cache === null ? ' t="str"' : ''}><f>${xml(value.expression)}</f><v>${value.cache ?? ''}</v></c>`;
          // Literal OOXML strings also escape Excel's own _xNNNN_ escape syntax.
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value.replace(/_x[0-9a-f]{4}_/gi, (text) => '_x005F_' + text.slice(1))).replace(/\r/g, '&#13;')}</t></is></c>`;
        })
        .join('');
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join('');
  return `${header}<worksheet xmlns="${main}"><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export function xlsx(sheets: Sheet[]) {
  const targets = sheets.map((_, i) => `worksheets/sheet${i + 1}.xml`);
  return zip(
    [
      [
        '[Content_Types].xml',
        `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${mime}.sheet.main+xml"/>${targets.map((path) => `<Override PartName="/xl/${path}" ContentType="${mime}.worksheet+xml"/>`).join('')}</Types>`,
      ],
      [
        '_rels/.rels',
        `${header}<Relationships xmlns="${packageRelationships}">${rel('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`,
      ],
      [
        'xl/workbook.xml',
        `${header}<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets>${sheets.map(({ name }, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`,
      ],
      [
        'xl/_rels/workbook.xml.rels',
        `${header}<Relationships xmlns="${packageRelationships}">${targets.map((path, i) => rel('rId' + (i + 1), 'worksheet', path)).join('')}</Relationships>`,
      ],
      ...sheets.map((sheet, i): [string, string] => ['xl/' + targets[i]!, sheetXml(sheet)]),
    ],
    mime + '.sheet',
  );
}
