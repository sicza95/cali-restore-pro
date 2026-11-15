import { For, Show } from 'solid-js';
import { estimateCopy } from '../../../platform/estimates/copy';
import type { EstimateSnapshot } from '../../../platform/estimates/types';
import {
  formatArea,
  formatHours,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
} from '../../../platform/format/number';
import type { Language } from '../types';
import { extraRate, phaseEffort, phaseRate } from './estimate-model';
import type { Phase } from './estimate-model';
import { versionLine } from './estimate-version';

/** What a saved estimate version holds: its total, objects, phases, extras, adjustments and tax. */
export function EstimateVersion(props: { language: Language; saved: EstimateSnapshot }) {
  const c = () => estimateCopy[props.language];
  const item = () => props.saved.input;
  const lang = () => props.language;
  const selected = (id: string) => item().selected.includes(id);
  const phaseUnit = (phase: Phase) =>
    phase.price === 'area' ? phase.units : phase.price === 'hourly' ? 'h' : undefined;
  const effort = (phase: Phase) =>
    phase.mode === 'time'
      ? formatHours(phaseEffort(phase), lang()) + ' h'
      : formatArea(phaseEffort(phase), phase.units, lang()) + '/h';
  return (
    <div class="review-inset" role="status">
      <p>
        {versionLine(props.language, props.saved)} · {item().currency}
      </p>
      <p>
        {c().total} · {formatMoney(props.saved.result.total, item().currency, lang())}
      </p>
      <p>
        {item()
          .objects.filter((o) => selected(o.id))
          .map((o) => o.name)
          .join(' · ')}
      </p>
      <ul>
        <For
          each={item().phases.filter(
            (p) =>
              !p.archived &&
              item().objects.some((o) => selected(o.id) && o.surfaces.includes(p.surface)),
          )}
        >
          {(phase) => (
            <li>
              {phase.name} · {c()[phase.price]} ·{' '}
              {formatRate(phaseRate(phase), item().currency, phaseUnit(phase), lang())} ·{' '}
              {c()[phase.mode]} {effort(phase)} · ×{formatNumber(phase.multiplier, lang(), 4)}
            </li>
          )}
        </For>
        <For each={item().extras.filter((e) => e.included && (!e.object || selected(e.object)))}>
          {(extra) => (
            <li>
              {extra.name} ·{' '}
              {formatRate(
                extraRate(extra),
                item().currency,
                extra.method === 'hourly' ? 'h' : undefined,
                lang(),
              )}
            </li>
          )}
        </For>
        <For each={item().adjustments}>
          {(row) => (
            <li>
              {row.name} · {formatPercent(row.percent, lang(), true)}
            </li>
          )}
        </For>
      </ul>
      <Show when={item().tax.enabled}>
        <p>
          {c().taxTotal} · {formatPercent(item().tax.rate, lang())}
        </p>
      </Show>
      <Show when={item().assumptions}>
        <p>{item().assumptions}</p>
      </Show>
    </div>
  );
}
