import type { BrowserItemDescriptor } from '../../../platform/projects/browser-contracts';
import type { Language } from '../../../platform/i18n/language';
import { browserCopy } from './browser-copy';

export function childLabel(item: BrowserItemDescriptor, language: Language) {
  const copy = browserCopy[language];
  if (item.childCount === null) return copy.unknown;
  return copy.childCount(item.kind, item.childCount);
}
