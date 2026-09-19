import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const settingsStyles = readFileSync(
  new URL('../../styles/settings-v3.css', import.meta.url),
  'utf8',
);
const settingsDensityStyles = readFileSync(
  new URL('../../styles/settings-v08.css', import.meta.url),
  'utf8',
);
const sectorsStyles = readFileSync(
  new URL('../../styles/sectors-v3.css', import.meta.url),
  'utf8',
);
const settingsPage = readFileSync(
  new URL('../../pages/ParametresPage.jsx', import.meta.url),
  'utf8',
);
const settingsHeader = readFileSync(
  new URL('./SettingsHeader.jsx', import.meta.url),
  'utf8',
);

function classNames(source) {
  return new Set(
    [...source.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)/g)]
      .map((match) => match[1]),
  );
}

test('settings shell uses its own namespace instead of sector sv3 shell classes', () => {
  assert.match(settingsPage, /className="settings-v3-page"/);
  assert.match(settingsPage, /className="settings-v3-content"/);
  assert.match(settingsHeader, /className="settings-v3-header"/);
  assert.match(settingsHeader, /className="settings-v3-search"/);
  assert.doesNotMatch(
    settingsPage,
    /className="sv3-(?:page|content)"/,
  );
  assert.doesNotMatch(
    settingsHeader,
    /className="sv3-(?:header|search|icon-button|title-row|title-icon|eyebrow)"/,
  );
});

test('settings and sectors styles no longer share selector class names', () => {
  const settingsClasses = classNames(
    `${settingsStyles}\n${settingsDensityStyles}`,
  );
  const sectorClasses = classNames(sectorsStyles);
  const overlap = [...settingsClasses]
    .filter((className) => sectorClasses.has(className))
    .sort();

  assert.deepEqual(overlap, []);
});
