import { reportCopy } from './copy';
import type { Row } from './export-rows';
import type { Draft, PreviewSurface } from './types';

export function assessmentBlock(
  draft: Draft,
  surface: PreviewSurface,
  id: string,
  comparison: boolean,
) {
  const c = reportCopy[draft.language];
  const version = surface.assessments?.find((assessment) => assessment.id === id);
  const name = id === 'current' ? c.current : (version?.name ?? c.missingCheckpoint);
  const heading = [
    surface.object + ' / ' + surface.name,
    ...(comparison ? [c.comparison] : []),
    name,
  ].join(' · ');
  const rows: Row[] = [
    [heading, c.status, version?.area == null ? c.missing : c.measured],
    [heading, c.units, surface.unit],
  ];
  if (version?.date !== undefined)
    rows.push([heading, c.checkpointDate, new Date(version.date).toISOString()]);
  if (version?.revision !== undefined) {
    rows.push(
      [heading, c.assessmentRevision, version.revision],
      [heading, c.frameRevision, version.frame ?? null],
    );
    rows.push([heading, c.calibrationRevision, version.calibration ?? null]);
    if (version.policy) rows.push([heading, c.calculation, version.policy]);
  }
  const factor = { 'm²': 1, 'cm²': 0.0001, 'ft²': 0.09290304, 'in²': 0.00064516 }[surface.unit];
  function area(label: string, amount?: number | null) {
    const converted = amount == null ? NaN : amount / factor;
    rows.push([
      heading,
      label,
      Number.isFinite(converted) ? Number(converted.toPrecision(15)) : null,
      surface.unit,
    ]);
  }
  const map = draft.content.map ? version?.map : undefined;
  if (draft.content.map) {
    rows.push([heading, c.map, map ? c.assessmentMap : c.mapMissing]);
    if (map?.extentM) {
      const length = { 'm²': 'm', 'cm²': 'cm', 'ft²': 'ft', 'in²': 'in' }[surface.unit];
      const extent = (value: number) => value / Math.sqrt(factor);
      rows.push(
        [heading, c.mapWidth, extent(map.extentM.width), length],
        [heading, c.mapHeight, extent(map.extentM.height), length],
      );
    }
  }
  if (draft.content.legend) {
    const legend = version?.legend ?? [];
    if (legend.length) legend.forEach((label) => rows.push([heading, c.legend, label]));
    else rows.push([heading, c.legend, c.legendMissing]);
  }
  if (draft.content.table) {
    area(c.area, version?.area);
    area(c.unique, version?.unique);
    rows.push([heading, c.coverage, version?.coverage ?? null, '%']);
    version?.categories.forEach((row) => area(c.category + ' · ' + row.name, row.area));
    if (comparison) {
      const primary = surface.assessments?.find(({ id }) => id === surface.version);
      const delta = (main?: number | null, other?: number | null) =>
        main == null || other == null ? null : main - other;
      area(c.areaChange, delta(primary?.area, version?.area));
      area(c.damageChange, delta(primary?.unique, version?.unique));
    }
  }
  if (draft.content.detail)
    version?.layers.forEach((row) => area(c.layer + ' · ' + row.name, row.area));
  const photos: { label: string; url: string }[] = [];
  if (!comparison)
    for (const ordinal of surface.references) {
      const label = c.reference + ' ' + ordinal;
      const photo = surface.photos?.find((photo) => photo.ordinal === ordinal);
      rows.push([
        heading,
        label,
        photo ? c.refIncluded : ['CSV', 'XLSX'].includes(draft.format) ? c.refRecord : c.refPending,
      ]);
      if (photo) photos.push({ label, url: photo.url });
    }
  return { heading, name, rows, map, photos };
}
