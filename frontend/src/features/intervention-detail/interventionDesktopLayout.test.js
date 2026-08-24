import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(
  new URL('../../styles/intervention-detail.css', import.meta.url),
  'utf8',
);
const shellStyles = readFileSync(
  new URL('../../styles/shell-v08.css', import.meta.url),
  'utf8',
);
const responsiveStyles = readFileSync(
  new URL('../../styles/intervention-v08-layout.css', import.meta.url),
  'utf8',
);
const wideDesktopStyles = responsiveStyles.slice(
  responsiveStyles.indexOf('@media (min-width: 1650px)'),
  responsiveStyles.indexOf('A 900–1180px operations viewport'),
);

test('detail workspace sizes against available content width', () => {
  assert.match(styles, /container:\s*intervention-detail\s*\/\s*inline-size/);
  assert.match(styles, /@container intervention-detail \(min-width: 900px\)/);
  assert.match(styles, /@container intervention-detail \(min-width: 1500px\)/);
  assert.match(styles, /grid-template-areas:\s*"timeline center evidence"/);
});

test('sticky header owns a stacking layer above map content', () => {
  assert.match(
    styles,
    /\.intervention-detail-page\s*>\s*\.intervention-detail-header\s*\{[^}]*z-index:\s*100/s,
  );
  assert.match(
    styles,
    /\.intervention-detail-page\s*>\s*\.intervention-detail-layout\s*\{[^}]*z-index:\s*0/s,
  );
  assert.match(
    styles,
    /\.intervention-detail-map-card\s*\{[^}]*isolation:\s*isolate/s,
  );
});

test('detail rails share the page scroll owner instead of overlapping cards', () => {
  assert.match(
    styles,
    /\.intervention-detail-timeline-rail,\s*\.intervention-detail-evidence-rail\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s,
  );
  assert.doesNotMatch(
    styles,
    /\.intervention-detail-(?:timeline|evidence)-rail[^}]*overflow-y:\s*auto/s,
  );
  assert.doesNotMatch(
    wideDesktopStyles,
    /\.intervention-detail-(?:timeline|evidence)-rail[^}]*overflow-y:\s*auto/s,
  );
});

test('wide desktop center stretches its cards across the available column', () => {
  assert.match(
    wideDesktopStyles,
    /\.intervention-detail-center\s*\{[^}]*align-items:\s*stretch/s,
  );
});

test('sidebar navigation items do not create an overlapping sticky layer', () => {
  assert.doesNotMatch(
    shellStyles,
    /\.sidebar-nav-item\[data-page-id="dashboard"\][^{]*\{[^}]*position:\s*sticky/s,
  );
});
