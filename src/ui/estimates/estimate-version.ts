import { estimateCopy } from '../../platform/estimates/copy';
import type { EstimateSnapshot } from '../../platform/estimates/types';
import type { Language } from '../account-access/types';

/** "Version 4 · Issued · 15 Nov 2026, 14:03": what a saved estimate version is, in words. */
export function versionLine(language: Language, saved: EstimateSnapshot | undefined) {
  if (!saved) return '';
  const c = estimateCopy[language];
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  return [
    c.versionName(saved.version),
    saved.issued ? c.issuedState : c.savedState,
    when.format(new Date(saved.createdAt)),
  ].join(' · ');
}
