import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pageSource = fs.readFileSync(
  fileURLToPath(new URL('../../pages/CarteLivePage.jsx', import.meta.url)),
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
