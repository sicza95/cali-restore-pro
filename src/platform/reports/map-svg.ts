import type { Tile } from '../projects/patterns';
import type { AssessmentMap } from './assessment-map';
import { xml } from './export-bytes';

export function tileShape(tile: Tile): { path?: string; dot?: number; text?: number } {
  const s = tile.spacing;
  const mid = s / 2;
  const size = Math.min(tile.size, s - tile.weight);
  const start = (s - size) / 2;
  switch (tile.kind) {
    case 'lines':
      return { path: `M0 ${mid}H${s}` };
    case 'grid':
      return { path: `M0 ${mid}H${s} M${mid} 0V${s}` };
    case 'hatch':
      return { path: `M0 0L${s} ${s} M0 ${s}L${s} 0` };
    case 'custom':
      return {
        path:
          'M' +
          tile.points!.map(([x, y]) => [start + x * size, start + y * size].join(' ')).join('L'),
      };
    case 'dots':
      return { dot: size / 2 };
    case 'shapes':
      return { path: `M${start} ${start}h${size}v${size}h-${size}Z` };
    case 'motif':
      return { text: Math.min(size, s / Math.max(1, tile.motif.length)) };
  }
}

function motif(tile: Tile) {
  const { path, dot, text } = tileShape(tile);
  const { spacing, weight, color } = tile;
  const mid = spacing / 2;
  if (path) return `<path d="${path}" stroke="${color}" stroke-width="${weight}" fill="none"/>`;
  if (dot) return `<circle cx="${mid}" cy="${mid}" r="${dot}" fill="${color}"/>`;
  return `<text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-size="${text}" fill="${color}">${xml(tile.motif)}</text>`;
}

export function mapSvg(
  map: AssessmentMap,
  prefix: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const shapes = map.paints.map((paint, i) => {
    let fill = paint.fill === 'solid' ? paint.color : 'none';
    let pattern = '';
    if (paint.fill === 'hatch') {
      const id = prefix + '-' + i;
      const tile = paint.tile;
      pattern = tile
        ? `<pattern id="${id}" width="${tile.spacing}" height="${tile.spacing}" patternUnits="userSpaceOnUse" patternTransform="scale(.42) rotate(${tile.angle})">${motif(tile)}</pattern>`
        : `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 0L10 10" fill="none" stroke="${paint.color}" stroke-width="2.5"/></pattern>`;
      fill = `url(#${id})`;
    }
    return {
      pattern,
      path: `<path d="${paint.path}" fill="${fill}" opacity="${paint.opacity}" stroke="${paint.outline ? paint.color : 'none'}"/>`,
    };
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${map.width} ${map.height}" preserveAspectRatio="xMinYMid meet"><defs>${shapes.map(({ pattern }) => pattern).join('')}</defs><path d="${map.assessed}" fill="#dbd1bc"/>${shapes.map(({ path }) => path).join('')}</svg>`;
}
