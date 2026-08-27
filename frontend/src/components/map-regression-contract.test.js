import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mapPickerSource = readFileSync(
  new URL('./MapPicker.jsx', import.meta.url),
  'utf8',
);

const mapWindowSource = readFileSync(
  new URL('./MapWindow.jsx', import.meta.url),
  'utf8',
);

const timelineSource = readFileSync(
  new URL(
    '../features/intervention-detail/InterventionTimeline.jsx',
    import.meta.url,
  ),
  'utf8',
);

test(
  'MapPicker listens to clicks before the optional marker exists',
  () => {
    const handlerIndex =
      mapPickerSource.indexOf('<MapClickHandler');

    const markerConditionalIndex =
      mapPickerSource.indexOf('{externalPosition ? (');

    assert.notEqual(handlerIndex, -1);
    assert.notEqual(markerConditionalIndex, -1);

    assert.ok(
      handlerIndex < markerConditionalIndex,
    );
  },
);

test(
  'Intervention maps use the same keyless OpenStreetMap tiles',
  () => {
    const osmUrl =
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    assert.ok(mapPickerSource.includes(osmUrl));
    assert.ok(mapWindowSource.includes(osmUrl));

    assert.equal(
      mapWindowSource.includes('basemaps.cartocdn.com'),
      false,
    );
  },
);

test(
  'Timeline exposes semantic assignment labels',
  () => {
    assert.ok(
      timelineSource.includes(
        "unassigned: { label: 'Désaffectation', tone: 'warning' }",
      ),
    );

    assert.ok(
      timelineSource.includes(
        "reassigned: { label: 'Réaffectation', tone: 'info' }",
      ),
    );
  },
);


test(
  'Intervention map does not request the invalid OSM d subdomain',
  () => {
    assert.equal(
      mapWindowSource.includes("'abcd'"),
      false,
    );

    assert.ok(
      mapWindowSource.includes("'abc'"),
    );
  },
);
