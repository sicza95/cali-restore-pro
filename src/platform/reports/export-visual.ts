import { reportBlocks } from './export-rows';
import type { AssessmentMap } from './assessment-map';
import { mapSvg } from './map-svg';
import { paintMap } from './map-canvas';
import { reportCopy } from './copy';
import type { Draft } from './types';
import { cleanLogo, pngWithDensity } from './export-png';
import { printablePdf } from './export-pdf';
import { xml } from './export-bytes';

const pageWidth = 595;
const pageHeight = 842;
const margin = 44;
const bodyWidth = pageWidth - margin * 2;
const font = 'Arial, sans-serif';
const ink = '#202429';
const muted = '#4b555e';
type Text = { text: string; x: number; y: number; size: number; bold: boolean; color: string };
type Drawing =
  | Text
  | { map: AssessmentMap; y: number }
  | { photo: string; y: number }
  | { logo: true; y: number };
const mapHeight = 220;
const photoHeight = 150;
function fontStyle(size: number, bold: boolean) {
  return (bold ? 'bold ' : '') + size + 'px ' + font;
}

function scene(draft: Draft, hasLogo: boolean, paged: boolean) {
  const measurement = new OffscreenCanvas(1, 1).getContext('2d');
  if (!measurement) throw new Error('Canvas unavailable');
  const context = measurement;
  const c = reportCopy[draft.language];
  const pages: Drawing[][] = [];
  let page: Drawing[] = [];
  let y = margin;
  let bodyStart = margin;
  const accent = /^#[0-9a-f]{6}$/i.test(draft.branding?.accent ?? '')
    ? draft.branding!.accent
    : ink;
  function addPage() {
    if (pages.length === 12) throw new Error('Too many pages');
    page = [];
    pages.push(page);
    y = margin;
    addText(c.title, 21, true, accent);
    addText(c.exportNote, 10, false, muted);
    y += 16;
    bodyStart = y;
  }
  function space(height: number) {
    if (paged && y + height > pageHeight - margin) addPage();
    if (y + height > 10000) throw new Error('Report height limit');
  }
  function wrap(text: string, size: number, bold: boolean) {
    context.font = fontStyle(size, bold);
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/u)) {
        const joined = current ? current + ' ' + word : word;
        if (context.measureText(joined).width <= bodyWidth) {
          current = joined;
          continue;
        }
        if (current) lines.push(current);
        current = '';
        for (const character of word) {
          if (context.measureText(current + character).width > bodyWidth) {
            lines.push(current);
            current = '';
          }
          current += character;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  const lineHeight = (size: number) => Math.ceil(size * 1.42);
  function addLines(lines: string[], size: number, bold: boolean, color = ink) {
    for (const text of lines) {
      space(lineHeight(size));
      page.push({ text, x: margin, y: y + size, size, bold, color });
      y += lineHeight(size);
    }
  }
  function addText(text: string, size: number, bold: boolean, color: string) {
    addLines(wrap(text, size, bold), size, bold, color);
  }

  addPage();
  if (hasLogo) {
    page.push({ logo: true, y });
    y += 62;
  }
  const format = new Intl.NumberFormat(draft.language, { maximumFractionDigits: 18 });
  for (const block of reportBlocks(draft)) {
    const heading = block.heading ? wrap(block.heading, 13, true) : [];
    const rows = block.rows
      .filter(([, label]) => label !== c.project)
      .flatMap(([, label, value, unit]) => {
        const text =
          value === null ? '—' : typeof value === 'number' ? format.format(value) : value;
        return wrap(
          [label, text + (unit ? ' ' + unit : '')].filter(Boolean).join(' · '),
          11,
          false,
        );
      });
    const height =
      heading.length * lineHeight(13) + rows.length * lineHeight(11) + (block.map ? mapHeight : 0);
    if (paged) space(height <= pageHeight - margin - bodyStart ? height : 64);
    addLines(heading, 13, true);
    addLines(rows, 11, false);
    if (block.map) {
      space(mapHeight);
      page.push({ map: block.map, y });
      y += mapHeight;
    }
    for (const photo of block.photos ?? []) {
      space(photoHeight + 26);
      addText(photo.label, 11, true, ink);
      page.push({ photo: photo.url, y });
      y += photoHeight + 8;
    }
    y += 17;
  }
  return { pages, height: Math.ceil(y + margin) };
}

function renderSvg(draft: Draft, drawings: Drawing[], height: number, logo?: string) {
  const marks = drawings.map((mark, index) => {
    if ('text' in mark)
      return `<text x="${mark.x}" y="${mark.y}" font-size="${mark.size}" font-weight="${mark.bold ? 700 : 400}" fill="${mark.color}">${xml(mark.text)}</text>`;
    if ('logo' in mark)
      return `<image x="${margin}" y="${mark.y}" width="120" height="50" preserveAspectRatio="xMinYMin meet" href="${logo}"/>`;
    if ('photo' in mark)
      return `<image x="${margin}" y="${mark.y}" width="${bodyWidth}" height="${photoHeight}" preserveAspectRatio="xMinYMid meet" href="${mark.photo}"/>`;
    return mapSvg(mark.map, 'map-' + index, margin, mark.y, bodyWidth, mapHeight);
  });
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" xml:lang="${draft.language === 'hu' ? 'hu' : 'en'}" width="${pageWidth}" height="${height}" viewBox="0 0 ${pageWidth} ${height}" font-family="${font}">`,
      '<rect width="100%" height="100%" fill="#ffffff"/>',
      ...marks,
      '</svg>',
    ],
    { type: 'image/svg+xml' },
  );
}

async function raster(drawings: Drawing[], height: number, dpi: number, logo?: ImageBitmap) {
  const scale = dpi / 72;
  const widthPx = Math.ceil(pageWidth * scale);
  const heightPx = Math.ceil(height * scale);
  if (widthPx * heightPx > 36_000_000 || heightPx > 16384) throw new Error('Raster size limit');
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.scale(scale, scale);
  for (const mark of drawings) {
    if ('text' in mark) {
      ctx.font = fontStyle(mark.size, mark.bold);
      ctx.fillStyle = mark.color;
      ctx.fillText(mark.text, mark.x, mark.y);
    } else if ('logo' in mark && logo) {
      const ratio = Math.min(120 / logo.width, 50 / logo.height);
      ctx.drawImage(logo, margin, mark.y, ratio * logo.width, ratio * logo.height);
    } else if ('map' in mark) {
      paintMap(ctx, mark.map, margin, mark.y, bodyWidth, mapHeight);
    } else if ('photo' in mark) {
      const bytes = Uint8Array.from(
        atob(mark.photo.slice('data:image/jpeg;base64,'.length)),
        (ch) => ch.charCodeAt(0),
      );
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      try {
        const ratio = Math.min(bodyWidth / image.width, photoHeight / image.height);
        ctx.drawImage(
          image,
          margin,
          mark.y + (photoHeight - image.height * ratio) / 2,
          image.width * ratio,
          image.height * ratio,
        );
      } finally {
        image.close();
      }
    }
  }
  return canvas;
}

export async function visualExport(draft: Draft) {
  const logo = await cleanLogo(draft.branding?.logo);
  try {
    const { pages, height } = scene(draft, !!logo, draft.format === 'PDF');
    if (draft.format === 'SVG') return renderSvg(draft, pages[0]!, height, logo?.url);
    const dpi = Number(draft.resolution ?? '300');
    if (![150, 300, 600].includes(dpi)) throw new Error('Resolution unavailable');
    if (draft.format === 'PNG') {
      const canvas = await raster(pages[0]!, height, dpi, logo?.bitmap);
      try {
        return await pngWithDensity(await canvas.convertToBlob({ type: 'image/png' }), dpi);
      } finally {
        canvas.width = canvas.height = 1;
      }
    }
    return await printablePdf(
      pages.length,
      draft.language,
      pageWidth,
      pageHeight,
      async (index) => {
        const canvas = await raster(pages[index]!, pageHeight, dpi, logo?.bitmap);
        try {
          return {
            width: canvas.width,
            height: canvas.height,
            jpeg: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.94 }),
          };
        } finally {
          canvas.width = canvas.height = 1;
        }
      },
    );
  } finally {
    logo?.bitmap.close();
  }
}
