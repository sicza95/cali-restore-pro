import { createSignal } from 'solid-js';

const storageKey = 'cr-sidebar';

function stored() {
  try {
    return localStorage.getItem(storageKey) !== 'hidden';
  } catch {
    return true;
  }
}

/** Whether the menu sidebar stays open. Off, it floats in when the pointer reaches the left edge. */
const [pinned, setPinned] = createSignal(stored());
export const sidebarPinned = pinned;

export function setSidebarPinned(value: boolean) {
  setPinned(value);
  try {
    localStorage.setItem(storageKey, value ? 'pinned' : 'hidden');
  } catch {
    /* The choice still holds for this page. */
  }
}
