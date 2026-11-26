import { describe, expect, it } from 'vitest';
import { keyboardCommand, navigationIndex, reconcileSelection } from './navigation';

describe('browser navigation', () => {
  it('moves in visual columns at both iPad grid densities, including an incomplete final row', () => {
    expect(navigationIndex('ArrowDown', 1, 8, 3)).toBe(4);
    expect(navigationIndex('ArrowUp', 4, 8, 3)).toBe(1);
    expect(navigationIndex('ArrowDown', 5, 8, 3)).toBe(7);
    expect(navigationIndex('ArrowDown', 1, 8, 2)).toBe(3);
    expect(navigationIndex('ArrowLeft', 3, 8, 2)).toBe(2);
    expect(navigationIndex('ArrowRight', 3, 8, 2)).toBe(4);
  });
  it('supports lists, endpoints, empty results and unrelated keys', () => {
    expect(navigationIndex('ArrowUp', 0, 5, 1)).toBe(0);
    expect(navigationIndex('ArrowDown', 4, 5, 1)).toBe(4);
    expect(navigationIndex('Home', 4, 5, 1)).toBe(0);
    expect(navigationIndex('End', 0, 5, 1)).toBe(4);
    expect(navigationIndex('End', 0, 0, 1)).toBeNull();
    expect(navigationIndex('a', 0, 5, 1)).toBeNull();
  });
  it('preserves selection on sort/view changes and selects the next survivor after removal', () => {
    expect(reconcileSelection(['c', 'b', 'a'], 'b', ['a', 'b', 'c'])).toBe('b');
    expect(reconcileSelection(['a', 'c', 'd'], 'b', ['a', 'b', 'c', 'd'])).toBe('c');
    expect(reconcileSelection(['a', 'b'], 'c', ['a', 'b', 'c'])).toBe('b');
    expect(reconcileSelection(['a'], null)).toBe('a');
    expect(reconcileSelection(['x'], 'b', ['a', 'b', 'c'])).toBe('x');
    expect(reconcileSelection([], 'a', ['a'])).toBeNull();
  });
  it('maps actions but leaves typing, composition and modifier combinations alone', () => {
    for (const [key, command] of [
      ['Enter', 'open'],
      ['F2', 'rename'],
      ['Delete', 'delete'],
    ]) {
      expect(keyboardCommand({ key }, false)).toBe(command);
      expect(keyboardCommand({ key }, true)).toBeNull();
    }
    expect(keyboardCommand({ key: 'f', ctrlKey: true }, false)).toBe('find');
    expect(keyboardCommand({ key: 'F', metaKey: true }, false)).toBe('find');
    expect(keyboardCommand({ key: 'ArrowUp', altKey: true }, false)).toBe('parent');
    expect(keyboardCommand({ key: 'Enter', ctrlKey: true }, false)).toBeNull();
    expect(keyboardCommand({ key: 'Delete', isComposing: true }, false)).toBeNull();
    expect(keyboardCommand({ key: 'F2', defaultPrevented: true }, false)).toBeNull();
  });
});
