import { measureAssessment } from '../projects/measure-assessment';
import { selectAssessment } from '../projects/assessment-selection';
import type { Surface } from '../projects/types';
import { assessmentMap } from './assessment-map';
import { reportCopy } from './copy';
import type { ReportAssessment, ReportSettings } from './types';

export async function prepareAssessment(
  surface: Surface,
  id: string,
  revision: number,
  settings: Pick<ReportSettings, 'content' | 'language'>,
  signal: AbortSignal,
): Promise<ReportAssessment> {
  const selected = selectAssessment(surface, id);
  const state = selected?.state;
  const report: ReportAssessment = {
    id,
    name: selected?.name,
    date: selected?.date,
    categories: [],
    layers: [],
    legend: [],
  };
  if (!state) return report;
  const { content, language } = settings;
  const result = await measureAssessment(state, revision, signal);
  signal.throwIfAborted();
  const names = new Map(state.drawing?.map((row) => [row.key ?? String(row.id), row.name]));
  const c = reportCopy[language];
  const labels = new Map([
    ...state.layers.map(({ id }, index) => [id, c.layer + ' ' + (index + 1)] as const),
    ...state.categories.map(({ id }, index) => [id, c.group + ' ' + (index + 1)] as const),
  ]);
  const label = (id: string) => names.get(id)?.trim() || labels.get(id) || c.layer;
  const calibrated = result?.assessed.areaM2.status === 'valid' && result.assessed.pixels2 > 0;
  const quantities = (rows: { id: string; areaM2: { value: number | null } }[]) =>
    rows.map(({ id, areaM2 }) => ({ name: label(id), area: calibrated ? areaM2.value : null }));
  if (content.map) {
    try {
      report.map = assessmentMap(state, calibrated);
    } catch {
      // A legacy mask can be measurable but unsuitable for the map clipper.
    }
  }
  return {
    ...report,
    revision: state.revision,
    frame: state.frame.revision,
    calibration: state.calibration?.revision,
    policy: result?.policy,
    area: calibrated ? result.assessed.areaM2.value : null,
    unique: calibrated ? result.damage.areaM2.value : null,
    coverage: result?.damage.percent.value,
    categories: content.table ? quantities(result?.categories ?? []) : [],
    layers: content.detail ? quantities(result?.layers ?? []) : [],
    legend: content.legend
      ? state.layers
          .filter(({ mask }) => mask.length > 0)
          .flatMap(({ id }) => {
            const style = state.drawing?.find((row) => (row.key ?? String(row.id)) === id);
            return style &&
              (!style.visible || !style.opacity || (style.fill === 'none' && !style.outline))
              ? []
              : [label(id)];
          })
      : [],
  };
}
