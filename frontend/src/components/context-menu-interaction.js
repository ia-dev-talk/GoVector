export const SUBMENU_CLOSE_DELAY_MS = 180;

export function nextMenuItemIndex(key, currentIndex, itemCount) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    return -1;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return itemCount - 1;
  }

  if (key === 'ArrowUp') {
    return currentIndex <= 0
      ? itemCount - 1
      : currentIndex - 1;
  }

  if (key === 'ArrowDown') {
    return currentIndex < 0 || currentIndex === itemCount - 1
      ? 0
      : currentIndex + 1;
  }

  return currentIndex;
}
