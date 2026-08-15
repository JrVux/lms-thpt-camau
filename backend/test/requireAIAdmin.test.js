import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAIAdmin } from '../src/middleware/auth.js';

test('requireAIAdmin allows any user when AI_ADMIN_USERS is not set', () => {
  delete process.env.AI_ADMIN_USERS;
  delete process.env.AI_ADMIN_EMAIL;
  delete process.env.AI_ADMIN_USERNAME;
  let nextCalled = false;
  const req = { user: { id: '1', email: 'teacher@test.com', username: 'teacher1' } };
  const res = {};
  requireAIAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireAIAdmin allows only matching admin user when AI_ADMIN_USERS is set', () => {
  process.env.AI_ADMIN_USERS = 'admin@school.edu,superadmin';

  // Allowed admin by email
  let adminNext = false;
  const reqAdmin = { user: { id: '1', email: 'admin@school.edu', username: 'admin1' } };
  requireAIAdmin(reqAdmin, {}, () => { adminNext = true; });
  assert.equal(adminNext, true);

  // Allowed admin by username
  let superNext = false;
  const reqSuper = { user: { id: '2', email: 'other@test.com', username: 'SuperAdmin' } };
  requireAIAdmin(reqSuper, {}, () => { superNext = true; });
  assert.equal(superNext, true);

  // Non-admin teacher blocked
  let blocked = false;
  let statusSet = 0;
  let responseData = null;
  const reqTeacher = { user: { id: '3', email: 'teacher2@school.edu', username: 'teacher2' } };
  const resTeacher = {
    status(s) { statusSet = s; return this; },
    json(d) { responseData = d; }
  };
  requireAIAdmin(reqTeacher, resTeacher, () => { blocked = true; });
  assert.equal(blocked, false);
  assert.equal(statusSet, 403);
  assert.equal(responseData?.code, 'AI_ACCESS_DENIED');

  delete process.env.AI_ADMIN_USERS;
});
