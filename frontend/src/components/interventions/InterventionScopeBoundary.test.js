import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./InterventionScopeBoundary.jsx', import.meta.url),
  'utf8',
);

test('stale intervention scope makes the previous workspace inert and hidden from assistive tech', () => {
  assert.match(source, /content\?\.setAttribute\('inert', ''\)/);
  assert.match(source, /content\?\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /content\?\.removeAttribute\('inert'\)/);
  assert.match(source, /content\?\.removeAttribute\('aria-hidden'\)/);
});

test('blocking scope moves focus into the shield and traps keyboard navigation there', () => {
  assert.match(source, /scopeState\.status === 'error'[\s\S]*retryButtonRef\.current[\s\S]*cardRef\.current/);
  assert.match(source, /document\.addEventListener\([\s\S]*'keydown'[\s\S]*guardBlockedWorkspace[\s\S]*true/);
  assert.match(source, /event\.key === 'Tab'[\s\S]*event\.preventDefault\(\)[\s\S]*focusTarget\?\.focus/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
});

test('focus is restored to the previous operational control once the requested scope is ready', () => {
  assert.match(source, /restoreFocusRef\.current = activeElement/);
  assert.match(source, /restoreTarget\?\.isConnected/);
  assert.match(source, /restoreTarget\.focus\(\{ preventScroll: true \}\)/);
});

test('retry exempts only its exact synthetic refresh event from the stale-workspace keyboard guard', () => {
  assert.match(source, /const retryEvent = new KeyboardEvent\('keydown',[\s\S]*key: 'r'[\s\S]*bubbles: true/);
  assert.match(source, /retryKeyEventRef\.current = retryEvent;[\s\S]*document\.dispatchEvent\(retryEvent\)/);
  assert.match(source, /finally \{[\s\S]*retryKeyEventRef\.current = null/);
  assert.match(source, /isInternalScopeRetryEvent\([\s\S]*event,[\s\S]*retryKeyEventRef\.current[\s\S]*\)[\s\S]*return;/);
  assert.match(source, /return Boolean\(retryEvent\) && event === retryEvent/);
});
