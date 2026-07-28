import test from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmClassDeletion } from '../src/utils/classDeletion.js';

test('requires the exact class name before permanent deletion', () => {
  assert.equal(canConfirmClassDeletion('10A1', '10A1'), true);
  assert.equal(canConfirmClassDeletion('10a1', '10A1'), false);
  assert.equal(canConfirmClassDeletion(' 10A1 ', '10A1'), false);
  assert.equal(canConfirmClassDeletion('', '10A1'), false);
});
