import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SUBMENU_CLOSE_DELAY_MS,
  nextMenuItemIndex,
} from './context-menu-interaction.js';

test('submenu pointer corridor allows a natural mouse transition', () => {
  assert.ok(SUBMENU_CLOSE_DELAY_MS >= 150);

  const source = readFileSync(
    new URL('./ContextMenuView.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /onPointerLeave=\{scheduleSubmenuClose\}/);
  assert.match(source, /onPointerEnter:\s*cancelSubmenuClose/);
  assert.match(source, /onPointerLeave:\s*scheduleSubmenuClose/);

  const styles = readFileSync(
    new URL('../styles/index.css', import.meta.url),
    'utf8',
  );
  assert.match(
    styles,
    /\.ctx-menu-item--parent\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s,
  );
});

test('keyboard navigation stays inside the active menu and wraps', () => {
  assert.equal(nextMenuItemIndex('ArrowDown', 1, 3), 2);
  assert.equal(nextMenuItemIndex('ArrowDown', 2, 3), 0);
  assert.equal(nextMenuItemIndex('ArrowUp', 0, 3), 2);
  assert.equal(nextMenuItemIndex('Home', 2, 3), 0);
  assert.equal(nextMenuItemIndex('End', 0, 3), 2);

  const source = readFileSync(
    new URL('./ContextMenuView.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /activeMenu =\s*submenu &&/);
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /event\.key === 'ArrowLeft'/);
  assert.doesNotMatch(source, /submenuOpen\s*\?\s*null/);
});
