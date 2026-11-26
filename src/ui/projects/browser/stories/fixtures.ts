import type { Language } from '../../../../platform/i18n/language';
import type {
  BrowserItemDescriptor,
  BrowserItemKind,
} from '../../../../platform/projects/browser-contracts';
import type { BrowserPreview, BrowserSort } from '../types';
import { storyCopy } from './story-copy';

export function sortSampleItems(
  items: BrowserItemDescriptor[],
  sort: BrowserSort,
  language: Language,
) {
  const value = (item: BrowserItemDescriptor) =>
    sort.field === 'created' ? item.createdAt : item.updatedAt;
  return items.sort((a, b) => {
    if (sort.field !== 'name' && (value(a) === null || value(b) === null))
      return value(a) === value(b) ? a.id.localeCompare(b.id) : value(a) === null ? 1 : -1;
    const result =
      sort.field === 'name' ? a.name.localeCompare(b.name, language) : value(a)! - value(b)!;
    return (sort.direction === 'asc' ? result : -result) || a.id.localeCompare(b.id);
  });
}

export function sampleItems(level: BrowserItemKind, language: Language): BrowserItemDescriptor[] {
  const statuses = [
    'synced',
    'local',
    'pending',
    'conflict',
    'remote',
    'error',
    'unknown',
  ] as const;
  const names = storyCopy[language].names;
  return Array.from({ length: level === 'project' ? 8 : 7 }, (_, index) => ({
    id: `${level}-${index}`,
    kind: level,
    projectId: 'sample-project',
    ...(level === 'surface' ? { objectId: 'sample-object' } : {}),
    name: names[index],
    organisation: 'Painted heritage studio',
    owners: [
      { id: 'sample-owner-a', name: 'Anna Kovács' },
      { id: 'sample-owner-b', name: 'Márton Tóth' },
    ],
    createdAt: index === 6 ? null : Date.UTC(2026, 8, 3 + index),
    updatedAt: index === 6 ? null : Date.UTC(2026, 10, 10 + index),
    createdBy: 'sample-owner-a',
    childCount: index === 6 ? null : [4, 0, 3, 2, 1, 2, 0, 0][index],
    status: statuses[index % statuses.length],
    originals: index === 0 ? 'all' : index === 1 ? 'none' : 'partial',
    visibility: index === 7 ? 'listed' : 'private',
    access: index === 7 ? 'directory' : index === 4 ? 'read-only' : 'editable',
  }));
}

/** Only the existing generated plaster illustration, never a real project photo. */
export function samplePreviews(
  items: readonly BrowserItemDescriptor[],
): Record<string, BrowserPreview> {
  return Object.fromEntries(
    items.map((item, index) => [
      item.id,
      index === 0
        ? {
            images: [
              '/photos/painted-plaster.png',
              '/photos/painted-plaster.png#second',
              '/photos/painted-plaster.png#third',
            ],
          }
        : index === 2
          ? { cover: '/photos/painted-plaster.png' }
          : index === 3
            ? { cover: '/missing-browser-preview.png' }
            : {},
    ]),
  );
}
