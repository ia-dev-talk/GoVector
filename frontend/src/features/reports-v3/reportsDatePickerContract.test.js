import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headerSource = readFileSync(
  new URL('./ReportsHeader.jsx', import.meta.url),
  'utf8',
);

const cssSource = readFileSync(
  new URL('../../styles/reports-v3.css', import.meta.url),
  'utf8',
);

test('report dates support both French keyboard input and native calendar input', () => {
  assert.ok(headerSource.includes('type="text"'));
  assert.ok(headerSource.includes('type="date"'));

  const fieldCount = (
    headerSource.match(/<FrenchCivilDateField/g) || []
  ).length;

  assert.equal(fieldCount, 3);

  assert.ok(
    headerSource.includes(
      'setDraft(formatFrenchCivilDate(nextValue))',
    ),
  );

  assert.ok(
    headerSource.includes(
      'onChange?.(nextValue)',
    ),
  );
});

test('native report calendar remains an explicit clickable control', () => {
  assert.ok(cssSource.includes('.rv3-date-picker'));
  assert.ok(cssSource.includes('.rv3-date-native-input'));
  assert.ok(cssSource.includes('cursor: pointer'));
  assert.ok(cssSource.includes('opacity: 0'));
});
