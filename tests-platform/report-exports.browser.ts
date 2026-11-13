import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { Draft } from '../src/platform/reports/types';
import { input, phase } from '../tests-estimates/fixtures';

const draft: Draft = {
  format: 'PDF',
  project: { name: 'Őrzött fal', revision: 1, updatedAt: Date.UTC(2026, 10, 13) },
  language: 'hu',
  surfaces: [
    {
      id: 'surface-a',
      name: 'Selected panel',
      object: 'Panel',
      version: 'baseline',
      compare: 'followup',
      unit: 'ft²',
      references: [2],
    },
    {
      id: 'surface-c',
      name: 'Current only',
      object: 'Panel',
      version: 'current',
      compare: '',
      unit: 'm²',
      references: [],
    },
  ],
  resolution: '150',
  content: { map: true, legend: false, table: true, detail: false },
  notes: ' =1+1 "quoted"\nSecond line <script>forbidden()</script>',
  branding: {
    studio: 'Restoration Studio',
    contact: '',
    footer: 'Draft footer',
    accent: '#333333',
    logo: '',
  },
};

const estimate = input({
  phases: [
    phase(),
    phase({ id: 'archived-phase', name: 'HIDDEN_ARCHIVED', archived: true }),
    phase({ id: 'excluded-phase', name: 'HIDDEN_PHASE', surface: 'surface-b' }),
  ],
  extras: [
    {
      id: '1',
      name: 'Selected transport',
      object: 'object-a',
      method: 'hourly',
      hours: '2',
      rate: { hourly: '10' },
      included: true,
    },
    {
      id: '2',
      name: 'Selected permit',
      object: '',
      method: 'fixed',
      hours: '',
      rate: { fixed: '50' },
      included: true,
    },
    {
      id: '3',
      name: 'HIDDEN_EXTRA',
      object: 'object-b',
      method: 'fixed',
      hours: '',
      rate: { fixed: '9000' },
      included: true,
    },
  ],
  adjustments: [
    { id: 'markup', name: 'Markup', percent: '10' },
    { id: 'discount', name: 'Discount', percent: '-5' },
  ],
  tax: { enabled: true, rate: '20' },
});

function zipParts(bytes: Buffer) {
  const parts = new Map<string, string>();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    expect(bytes.readUInt16LE(offset + 8)).toBe(0);
    const size = bytes.readUInt32LE(offset + 18);
    const start = offset + 30 + bytes.readUInt16LE(offset + 26);
    const name = bytes.toString('utf8', offset + 30, start);
    parts.set(name, bytes.toString('utf8', start, start + size));
    offset = start + size;
  }
  expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
  expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
  expect(bytes.readUInt16LE(bytes.length - 12)).toBe(parts.size);
  return parts;
}

test('encodes scoped fixture payloads and cancels without publishing', async ({ page }, info) => {
  await page.goto('/');
  const files = await page.evaluate(
    async ({ draft, estimate }) => {
      const load = (path: string): Promise<unknown> => import(path);
      const { exportReport } = (await load(
        '/src/platform/reports/export.ts',
      )) as typeof import('../src/platform/reports/export');
      const { snapshot } = (await load(
        '/src/platform/estimates/snapshots.ts',
      )) as typeof import('../src/platform/estimates/snapshots');
      const { reportEstimate, coversEstimate } = (await load(
        '/src/platform/reports/estimate.ts',
      )) as typeof import('../src/platform/reports/estimate');
      const { workbookEstimate } = (await load(
        '/src/platform/reports/workbook-estimate.ts',
      )) as typeof import('../src/platform/reports/workbook-estimate');
      const issued = snapshot(estimate, 1, true);
      const source = { scope: 'estimate-full' as const, snapshot: issued };
      const summary = reportEstimate(source, 'summary', draft.project.revision);
      const full = reportEstimate(source, 'full', draft.project.revision);
      const editable = workbookEstimate(issued, draft.surfaces);
      const logoCanvas = new OffscreenCanvas(3, 3);
      logoCanvas.getContext('2d')!.fillRect(0, 0, 3, 3);
      const logo = new Uint8Array(await (await logoCanvas.convertToBlob()).arrayBuffer());
      const sourceMarker = 'HIDDEN_LOGO_METADATA';
      draft.branding!.logo =
        'data:image/png;base64,' + btoa(String.fromCharCode(...logo) + sourceMarker);
      const signal = new AbortController().signal;
      async function produce(next: Draft) {
        const blob = await exportReport(next, signal);
        return {
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
          type: blob.type,
        };
      }
      const cancel = new AbortController();
      const job = exportReport(draft, cancel.signal);
      cancel.abort();
      const cancelled = await job.then(
        () => false,
        (error: DOMException) => error.name === 'AbortError',
      );
      const oversized = await exportReport(
        {
          ...draft,
          format: 'PNG',
          resolution: '600',
          surfaces: Array.from({ length: 24 }, () => draft.surfaces[0]!),
        },
        signal,
      ).then(
        () => false,
        () => true,
      );
      const forbidden = await exportReport(
        { ...draft, format: 'XLSX', workbook: 'editable', estimate: summary },
        signal,
      ).then(
        () => false,
        () => true,
      );
      return {
        cancelled,
        oversized,
        forbidden,
        removedSurface: !coversEstimate(issued, draft.surfaces.slice(1)),
        pdf: await produce({ ...draft, estimate: summary }),
        png: await produce({ ...draft, format: 'PNG', estimate: summary }),
        svg: await produce({ ...draft, format: 'SVG', estimate: summary }),
        csv: await produce({ ...draft, format: 'CSV', estimate: summary }),
        xlsx: await produce({ ...draft, format: 'XLSX', estimate: summary }),
        editable: await produce({
          ...draft,
          format: 'XLSX',
          workbook: 'editable',
          estimate: full,
          workbookEstimate: editable,
        }),
      };
    },
    { draft, estimate },
  );

  expect(files.cancelled && files.oversized && files.forbidden && files.removedSurface).toBe(true);
  for (const format of ['pdf', 'png', 'svg', 'csv', 'xlsx', 'editable'] as const) {
    const bytes = Buffer.from(files[format].bytes);
    const ext = format === 'editable' ? 'xlsx' : format;
    await writeFile(info.outputPath(`fixture-${format}.${ext}`), bytes);
    const text = bytes.toString('utf8');
    for (const marker of ['HIDDEN_', 'calibration-r1', 'object-b', 'committed-r1'])
      expect(text).not.toContain(marker);
    if (format !== 'editable') {
      expect(text).not.toContain('Private access details');
      expect(text).not.toContain('Selected transport');
      expect(text).not.toContain('Cleaning');
    }
  }
  const pdf = Buffer.from(files.pdf.bytes).toString('latin1');
  expect(files.pdf.type).toBe('application/pdf');
  expect(pdf).toMatch(/^%PDF-1\.4/);
  expect(pdf).toContain('/Lang (hu)');
  expect(pdf).toContain('/Filter /DCTDecode');
  expect(pdf).not.toMatch(/\/Info|\/Metadata|\/EmbeddedFiles|\/JavaScript|\/Annots/);
  const pageIndex = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  expect(pdf.slice(pageIndex, pageIndex + 4)).toBe('xref');

  const png = Buffer.from(files.png.bytes);
  expect(files.png.type).toBe('image/png');
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(1240);
  const density = png.indexOf('pHYs');
  expect(png.readUInt32BE(density + 4)).toBe(5906);
  expect(png.readUInt32BE(density + 8)).toBe(5906);
  for (let offset = 8; offset < png.length; offset += png.readUInt32BE(offset) + 12)
    expect(png.toString('ascii', offset + 4, offset + 8)).toMatch(
      /^(IHDR|pHYs|IDAT|IEND|PLTE|tRNS|sRGB|gAMA|cHRM)$/,
    );

  const svg = Buffer.from(files.svg.bytes).toString();
  const structure = await page.evaluate((svg) => {
    const dom = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return {
      text: dom.documentElement.textContent,
      unexpected: dom.querySelectorAll(
        'parsererror, script, foreignObject, style, a, use, [onload]',
      ).length,
      logo: dom.querySelector('image')?.getAttribute('href'),
      maps: Array.from(dom.querySelectorAll('rect[fill="#9c4138"]'), (item) =>
        item.getAttribute('width'),
      ),
    };
  }, svg);
  expect(structure.unexpected).toBe(0);
  expect(structure.logo).toMatch(/^data:image\/png;base64,/);
  expect(
    Buffer.from(structure.logo!.split(',')[1]!, 'base64').includes('HIDDEN_LOGO_METADATA'),
  ).toBe(false);
  expect(structure.maps).toEqual(['45', '40']);
  expect(structure.text).toContain('Őrzött fal');
  expect(structure.text).toContain('64,58 ft²');
  expect(structure.text).toContain('Ehhez a verzióhoz nincs mérés.');
  expect(structure.text).toContain('Referenciafotó 2');
  expect(structure.text).not.toContain('Jelmagyarázat');
  expect(structure.text).not.toContain('Festékpergés');

  const csv = Buffer.from(files.csv.bytes).toString();
  expect(csv).toContain('szemléltető');
  expect(csv).toContain('"Terület",64.58,"ft²"');
  expect(csv).toContain('"Becsült végösszeg",378,"EUR"');
  expect(csv).toContain('"\' =1+1 ""quoted""\nSecond line');
  expect(csv).not.toContain('Jelmagyarázat');

  const xlsx = zipParts(Buffer.from(files.xlsx.bytes));
  expect(xlsx.size).toBe(5);
  expect(xlsx.get('xl/worksheets/sheet1.xml')).toContain('<v>64.58</v>');
  expect(xlsx.get('xl/worksheets/sheet1.xml')).toContain('<v>378</v>');
  expect(xlsx.get('xl/worksheets/sheet1.xml')).not.toContain('<f>');
  const workbook = zipParts(Buffer.from(files.editable.bytes));
  expect(workbook.size).toBe(9);
  const totals = workbook.get('xl/worksheets/sheet2.xml')!;
  const phases = workbook.get('xl/worksheets/sheet3.xml')!;
  const extras = workbook.get('xl/worksheets/sheet4.xml')!;
  const adjustments = workbook.get('xl/worksheets/sheet5.xml')!;
  expect(totals).toMatch(/r="B9"><f>[^<]+<\/f><v>378<\/v>/);
  expect(totals).toContain('Private access details');
  expect(phases).toMatch(/r="N2"><f>[^<]+<\/f><v>5<\/v>/);
  expect(phases).toContain('<v>230</v>');
  expect(extras).toContain('Selected transport');
  expect(extras).toContain('Selected permit');
  expect(adjustments).toContain('<v>-15</v>');
  for (const part of workbook.values())
    expect(part).not.toMatch(/TargetMode="External"|state="hidden"|HIDDEN_/);
});
