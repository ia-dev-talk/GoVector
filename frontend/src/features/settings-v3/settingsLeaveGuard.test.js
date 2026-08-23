import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasOrganizationDraft,
  isOrganizationControlDirty,
  isSettingsGlobalLeaveControl,
  shouldGuardSettingsLeave,
} from './settingsLeaveGuard.js';

function textControl(value = '', defaultValue = '') {
  return { tagName: 'INPUT', type: 'text', value, defaultValue };
}

function selectControl(value, baseline, { multiple = false } = {}) {
  const values = Array.isArray(value) ? value : [value];
  const baselines = Array.isArray(baseline) ? baseline : [baseline];
  const all = [...new Set([...values, ...baselines])];
  return {
    tagName: 'SELECT',
    type: 'select-one',
    multiple,
    options: all.map((optionValue, index) => ({
      value: optionValue,
      selected: values.includes(optionValue),
      defaultSelected: baselines.includes(optionValue) || (!baselines.length && index === 0),
    })),
  };
}

test('settings leave guard targets sidebar destinations and logout, not the active page', () => {
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item',
      ariaCurrent: '',
    }),
    true,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item sidebar-nav-item--logout',
    }),
    true,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item sidebar-nav-item--active',
      ariaCurrent: 'page',
    }),
    false,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-toggle',
    }),
    false,
  );
});

test('settings leave guard only blocks global leave controls while dirty', () => {
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: true,
      className: 'sidebar-nav-item',
    }),
    true,
  );
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: false,
      className: 'sidebar-nav-item',
    }),
    false,
  );
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: true,
      className: 'sidebar-toggle',
    }),
    false,
  );
});

test('organization dirty policy detects real form edits and restored baselines', () => {
  assert.equal(isOrganizationControlDirty(textControl('', '')), false);
  assert.equal(isOrganizationControlDirty(textControl('ops-admin', '')), true);
  assert.equal(isOrganizationControlDirty(textControl('IAM', 'IAM')), false);

  assert.equal(isOrganizationControlDirty(selectControl('', '')), false);
  assert.equal(isOrganizationControlDirty(selectControl('TECHNICIAN', '')), true);
  assert.equal(isOrganizationControlDirty(selectControl('', '')), false);

  assert.equal(
    isOrganizationControlDirty({
      tagName: 'INPUT',
      type: 'checkbox',
      checked: true,
      defaultChecked: false,
    }),
    true,
  );
});

test('organization dirty policy covers account/client/team forms and team assignment drafts', () => {
  const cleanForm = { elements: [textControl('', ''), selectControl('', '')] };
  const dirtyAccountForm = { elements: [textControl('dispatcher', ''), textControl('secret-value', '')] };
  const cleanTeamDraft = selectControl('', '');
  const dirtyTeamDraft = selectControl('42', '');

  const root = (forms, drafts) => ({
    querySelectorAll(selector) {
      if (selector === 'form') return forms;
      if (selector === '.v1-admin-team-add--explicit select') return drafts;
      return [];
    },
  });

  assert.equal(hasOrganizationDraft(root([cleanForm], [cleanTeamDraft])), false);
  assert.equal(hasOrganizationDraft(root([cleanForm, dirtyAccountForm], [cleanTeamDraft])), true);
  assert.equal(hasOrganizationDraft(root([cleanForm], [dirtyTeamDraft])), true);
  assert.equal(hasOrganizationDraft(root([cleanForm], [selectControl('', '')])), false);
});
