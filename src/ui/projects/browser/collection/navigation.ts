/** Shared by keyboard handling and tests. Never wraps at the ends of the collection. */
export function navigationIndex(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  if (!count) return null;
  const current = Math.max(0, Math.min(index, count - 1));
  const step = Math.max(1, Math.floor(columns));
  const next: Record<string, number> = {
    ArrowLeft: current - 1,
    ArrowRight: current + 1,
    ArrowUp: current - step,
    ArrowDown: current + step,
    Home: 0,
    End: count - 1,
  };
  return key in next ? Math.max(0, Math.min(next[key], count - 1)) : null;
}

/** Keep IDs stable through sort/view changes. After removal prefer the next surviving neighbour. */
export function reconcileSelection(
  ids: readonly string[],
  selectedId: string | null,
  previousIds: readonly string[] = [],
): string | null {
  if (selectedId && ids.includes(selectedId)) return selectedId;
  const oldIndex = selectedId ? previousIds.indexOf(selectedId) : -1;
  if (oldIndex >= 0) {
    const after = previousIds.slice(oldIndex + 1).find((id) => ids.includes(id));
    if (after) return after;
    const before = previousIds
      .slice(0, oldIndex)
      .reverse()
      .find((id) => ids.includes(id));
    if (before) return before;
  }
  return ids[0] ?? null;
}

export type BrowserKey = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
};
export type BrowserCommand = 'find' | 'parent' | 'open' | 'rename' | 'delete';
export function keyboardCommand(event: BrowserKey, typing: boolean): BrowserCommand | null {
  if (typing || event.defaultPrevented || event.isComposing) return null;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f')
    return 'find';
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowUp') return 'parent';
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const commands: Record<string, BrowserCommand> = {
    Enter: 'open',
    F2: 'rename',
    Delete: 'delete',
  };
  return commands[event.key] ?? null;
}

/** Works with DOM ancestry without requiring a DOM in the pure navigation tests. */
export function ignoresBrowserShortcuts(target: EventTarget | null): boolean {
  if (!target || !('closest' in target)) return false;
  const element = target as Element;
  return !!element.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"]',
  );
}
