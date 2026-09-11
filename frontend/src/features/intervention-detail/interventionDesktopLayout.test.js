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
const assessmentStyles = readFileSync(
  new URL('./orienteur-assessment.css', import.meta.url),
  'utf8',
);
const workspaceStyles = readFileSync(
  new URL('../../styles/interventions-v3.css', import.meta.url),
  'utf8',
);
const wideDesktopStyles = responsiveStyles.slice(
  responsiveStyles.indexOf('@media (min-width: 1650px)'),
  responsiveStyles.indexOf('A 900–1180px operations viewport'),
);
const mobileWorkspaceStyles = workspaceStyles.slice(
  workspaceStyles.lastIndexOf('@media (max-width: 980px)'),
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

test('mobile workspace overrides the final desktop intervention layer', () => {
  assert.match(
    mobileWorkspaceStyles,
    /\.intervention-workspace-header--v4\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s,
  );
  assert.match(
    mobileWorkspaceStyles,
    /\.intervention-kpi-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/s,
  );
  assert.match(
    mobileWorkspaceStyles,
    /\.intervention-toolbar-actions\s*\{[^}]*flex-wrap:\s*wrap\s*!important[^}]*overflow:\s*visible\s*!important/s,
  );
  assert.match(
    mobileWorkspaceStyles,
    /\.ie-main\.intervention-workspace-main,[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important/s,
  );
});

test('desktop operations grid receives the remaining vertical workspace', () => {
  assert.match(
    workspaceStyles,
    /\.ie-page\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0[^}]*height:\s*100%[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    workspaceStyles,
    /\.ie-main\.intervention-workspace-main\s*\{[^}]*flex:\s*1\s+1\s+0\s*!important[^}]*min-height:\s*0\s*!important/s,
  );
  assert.match(
    workspaceStyles,
    /\.intervention-technician-rail,[^{]*\.intervention-planning-panel,[^{]*\.intervention-inspector-panel\s*\{[^}]*min-height:\s*0\s*!important/s,
  );
});

test('delivery detail keeps main and secondary copy readable on dark cards', () => {
  assert.match(styles, /--intervention-text-main:\s*#f5f7fb/);
  assert.match(styles, /--intervention-text-secondary:\s*#c6d2e3/);
  assert.match(
    styles,
    /\.intervention-detail-assignment-copy strong,[\s\S]*color:\s*var\(--intervention-text-main\)/,
  );
  assert.match(assessmentStyles, /\.orienteur-assessment\s*\{[^}]*color:\s*#f5f7fb/s);
  assert.match(
    assessmentStyles,
    /\.orienteur-candidates\s*>\s*div\[aria-live="polite"\]\s*\{[^}]*max-height:\s*430px[^}]*overflow-y:\s*auto/s,
  );
});
