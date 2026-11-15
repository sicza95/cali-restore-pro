import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { measureAssessment } from '../../../platform/projects/measure-assessment';
import { selectAssessment } from '../../../platform/projects/assessment-selection';
import {
  measuredQuantity,
  updateMeasuredPhase,
} from '../../../platform/estimates/assessment-quantity';
import type { PlanarResult } from '../../../platform/projects/planar-measurement';
import type { PlanarSurface } from '../../../platform/projects/planar-types';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';
import type { PhaseModel } from './estimate-model';

export function usePhaseMeasurements(
  project: () => SavedProject,
  vault: () => LocalVault,
  model: PhaseModel,
) {
  const bindings = createMemo(() =>
    JSON.stringify(
      model.rows.map(({ id, surface, scope, scopeSource, assessment, archived }) => [
        id,
        surface,
        scope,
        scopeSource,
        assessment ?? 'current',
        archived,
      ]),
    ),
  );
  const [pending, setPending] = createSignal(false);
  createEffect(() => {
    bindings();
    const current = project();
    const revision = current.revision;
    const access = vault().accessSignal();
    const job = new AbortController();
    const signal = AbortSignal.any([job.signal, access]);
    onCleanup(() => job.abort());
    const rows = untrack(() =>
      model.active().map(({ id, scope, scopeSource, surface, assessment }) => ({
        id,
        scope,
        scopeSource,
        surface,
        assessment,
      })),
    );
    const surfaces = untrack(
      () =>
        new Map(
          current.objects.flatMap((object) =>
            object.surfaces.map((surface) => [surface.id, { object: object.id, surface }]),
          ),
        ),
    );
    const results = new Map<PlanarSurface, PlanarResult | null>();
    setPending(true);
    void (async () => {
      for (const row of rows) {
        signal.throwIfAborted();
        const entry = surfaces.get(row.surface);
        const selected =
          entry && row.scope
            ? selectAssessment(entry.surface, row.assessment ?? 'current')?.state
            : undefined;
        const state =
          selected && (!row.scopeSource || selected.source.id === row.scopeSource)
            ? selected
            : undefined;
        if (state && !results.has(state)) {
          results.set(
            state,
            await measureAssessment(structuredClone(unwrap(state)), revision, signal),
          );
          signal.throwIfAborted();
        }
        const quantity =
          state && entry
            ? measuredQuantity(
                current.id,
                entry.object,
                revision,
                row,
                state,
                results.get(state) ?? null,
              )
            : undefined;
        const phase = model.rows.find(({ id }) => id === row.id);
        if (phase) model.update(row.id, updateMeasuredPhase(phase, quantity));
      }
    })()
      .catch(() => {
        if (!signal.aborted)
          for (const row of rows)
            model.update(row.id, { measurement: 'missing', quantity: undefined });
      })
      .finally(() => {
        if (!signal.aborted) setPending(false);
      });
  });
  return pending;
}
