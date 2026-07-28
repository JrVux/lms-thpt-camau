import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeliveryPayload } from '../src/utils/deliveryForm.js';

test('keeps settings independent for every selected class', () => {
  const payload = buildDeliveryPayload({
    c1: { selected: true, recipient_mode: 'all', due_date: '2026-08-01', is_published: true, max_submissions: '2' },
    c2: { selected: true, recipient_mode: 'selected', student_ids: ['s1', 's1', 's2'], due_date: '2026-08-02', max_submissions: '' },
  });
  assert.deepEqual(payload.deliveries, [
    { class_id: 'c1', recipient_mode: 'all', student_ids: [], due_date: '2026-08-01', is_published: true, max_submissions: 2 },
    { class_id: 'c2', recipient_mode: 'selected', student_ids: ['s1', 's2'], due_date: '2026-08-02', is_published: false, max_submissions: null },
  ]);
});

test('rejects selected mode without students', () => {
  assert.throws(
    () => buildDeliveryPayload({ c1: { selected: true, recipient_mode: 'selected', student_ids: [] } }),
    /ít nhất một học sinh/
  );
});
