import assert from 'node:assert/strict';
import test from 'node:test';

import { JOB_TYPES_CONFIG } from './job-types.js';
import {
  applyPlanningFieldChange,
  catalogEstimatedDuration,
  deriveTimeSlotEnd,
  durationInputParts,
  durationMinutesFromParts,
  formatDurationHoursMinutes,
} from './job-planning.js';

test('Raccordement resolves to the backend catalog duration', () => {
  const catalogItem = {
    metadata: {
      default_estimated_duration_minutes: 120,
    },
  };

  assert.equal(
    catalogEstimatedDuration(
      catalogItem,
      JOB_TYPES_CONFIG.RACCORDEMENT.avgDuration,
    ),
    120,
  );
});

test('selecting Raccordement synchronizes estimate and generated slot', () => {
  const form = {
    job_type: '',
    time_slot_start: '08:00',
    time_slot_end: '09:00',
    estimated_duration: 60,
  };

  assert.deepEqual(
    applyPlanningFieldChange(form, 'job_type', 'RACCORDEMENT', {
      jobTypeDuration: 120,
    }),
    {
      job_type: 'RACCORDEMENT',
      time_slot_start: '08:00',
      time_slot_end: '10:00',
      estimated_duration: 120,
    },
  );
});

test('editing the estimate or start keeps the generated slot coherent', () => {
  const form = {
    job_type: 'RACCORDEMENT',
    time_slot_start: '08:00',
    time_slot_end: '10:00',
    estimated_duration: 120,
  };

  const shorter = applyPlanningFieldChange(
    form,
    'estimated_duration',
    '90',
  );
  assert.equal(shorter.time_slot_end, '09:30');

  const later = applyPlanningFieldChange(
    shorter,
    'time_slot_start',
    '13:15',
  );
  assert.equal(later.time_slot_end, '14:45');
  assert.equal(deriveTimeSlotEnd('08:00', 120), '10:00');
});

test('an explicit end remains editable and unrelated fields do not rewrite it', () => {
  const form = {
    time_slot_start: '08:00',
    time_slot_end: '12:00',
    estimated_duration: 120,
  };

  assert.equal(
    applyPlanningFieldChange(form, 'time_slot_end', '11:30').time_slot_end,
    '11:30',
  );
  assert.equal(
    applyPlanningFieldChange(form, 'customer_name', 'Client').time_slot_end,
    '12:00',
  );
});

test('duration input exposes hours and minutes while preserving minute storage', () => {
  assert.deepEqual(durationInputParts(90), { hours: 1, minutes: 30 });
  assert.equal(durationMinutesFromParts(1, 30), 90);
  assert.equal(formatDurationHoursMinutes(90), '01 h 30');
});

test('duration input enforces the existing 15 to 480 minute contract', () => {
  assert.equal(durationMinutesFromParts(0, 14), null);
  assert.equal(durationMinutesFromParts(0, 15), 15);
  assert.equal(durationMinutesFromParts(8, 0), 480);
  assert.equal(durationMinutesFromParts(8, 1), null);
  assert.deepEqual(durationInputParts('invalid'), { hours: '', minutes: '' });
  assert.equal(formatDurationHoursMinutes('invalid'), '');
});
