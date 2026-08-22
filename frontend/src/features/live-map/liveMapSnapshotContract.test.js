import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  hiddenLiveMapFilterKeys,
  reconcileLiveMapFiltersForTab,
} from './liveMapFilterScope.js';

const pageSource = fs.readFileSync(
  fileURLToPath(new URL('../../pages/CarteLivePage.jsx', import.meta.url)),
  'utf8',
);

const railSource = fs.readFileSync(
  fileURLToPath(new URL('./LiveMapRail.jsx', import.meta.url)),
  'utf8',
);

test('Carte live publishes its critical sources as one atomic snapshot', () => {
  assert.match(pageSource, /await Promise\.all\(\[/);
  assert.doesNotMatch(pageSource, /Promise\.allSettled\(/);
  assert.match(
    pageSource,
    /setTechnicians\([\s\S]*setJobs\([\s\S]*setSectors\([\s\S]*setLastUpdatedAt\(/,
  );
});

test('Carte live keeps the previous timestamp when a snapshot refresh fails', () => {
  const catchBlock = pageSource.match(/catch \(error\) \{([\s\S]*?)\n\s*\}\n\n\s*setLoading\(false\)/)?.[1] ?? '';
  assert.match(catchBlock, /setLoadError\(/);
  assert.doesNotMatch(catchBlock, /setLastUpdatedAt\(/);
  assert.doesNotMatch(catchBlock, /setTechnicians\(|setJobs\(|setSectors\(/);
});

test('Carte live keeps stale warning visible until a complete retry succeeds', () => {
  const loadBlock = pageSource.match(/const loadData = useCallback\(([\s\S]*?)\n\s*useEffect\(\(\) => \{/)?.[1] ?? '';
  const tryStart = loadBlock.indexOf('try {');
  const successClear = loadBlock.indexOf("setLoadError('');", tryStart);
  const publishTimestamp = loadBlock.indexOf('setLastUpdatedAt(new Date());', tryStart);

  assert.equal(
    loadBlock.slice(0, tryStart).includes("setLoadError('');"),
    false,
    'a retry must not clear the stale warning before the snapshot succeeds',
  );
  assert.ok(publishTimestamp >= 0, 'successful snapshot must publish a fresh timestamp');
  assert.ok(
    successClear > publishTimestamp,
    'stale warning should clear only after the fresh snapshot is published',
  );
});

test('Carte live exposes only filters that affect the active tab', () => {
  assert.deepEqual(
    hiddenLiveMapFilterKeys('technicians'),
    ['operator'],
  );
  assert.deepEqual(
    hiddenLiveMapFilterKeys('jobs'),
    ['team', 'status'],
  );
});

test('Carte live clears hidden tab filters while preserving shared scope', () => {
  const sourceFilters = {
    sector: 'Sidi Maarouf',
    team: 'Équipe A',
    status: 'AVAILABLE',
    operator: 'Orange',
  };

  assert.deepEqual(
    reconcileLiveMapFiltersForTab(sourceFilters, 'jobs'),
    {
      sector: 'Sidi Maarouf',
      team: '',
      status: '',
      operator: 'Orange',
    },
  );

  assert.deepEqual(
    reconcileLiveMapFiltersForTab(sourceFilters, 'technicians'),
    {
      sector: 'Sidi Maarouf',
      team: 'Équipe A',
      status: 'AVAILABLE',
      operator: '',
    },
  );

  assert.deepEqual(sourceFilters, {
    sector: 'Sidi Maarouf',
    team: 'Équipe A',
    status: 'AVAILABLE',
    operator: 'Orange',
  });
});

test('Carte live rail reconciles hidden filters before switching tabs', () => {
  assert.match(
    railSource,
    /hiddenLiveMapFilterKeys\(nextTab\)\.forEach/,
  );
  assert.match(
    railSource,
    /onFilterChange\(key, ''\)[\s\S]*onTabChange\(nextTab\)/,
  );
  assert.doesNotMatch(
    railSource,
    /onClick=\{\(\) => onTabChange\('(technicians|jobs)'\)\}/,
  );
});
