import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmail, normalizeHandle } from '@wikiblog/shared';
import { equalToken, hashPassword, hashToken, token, validPassword, verifyPassword } from '../src/security.ts';

test('password hashes are salted and verify only the correct password', async () => {
  const first = await hashPassword('a long password');
  const second = await hashPassword('a long password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a long password', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  await assert.rejects(verifyPassword('a long password', 'invalid'));
});

test('session tokens are random, hashed, and compared safely', () => {
  const first = token();
  const second = token();
  assert.notEqual(first, second);
  assert.notEqual(hashToken(first), first);
  assert.equal(equalToken(first, first), true);
  assert.equal(equalToken(first, second), false);
  assert.equal(equalToken(first, 'invalid'), false);
});

test('credentials are normalized and invalid values are rejected', () => {
  assert.equal(normalizeEmail(' USER@Example.com '), 'user@example.com');
  assert.equal(normalizeEmail('bad-address'), null);
  assert.equal(normalizeHandle(' My_Space '), 'my_space');
  assert.equal(normalizeHandle('../bad'), null);
  assert.equal(validPassword('short'), false);
  assert.equal(validPassword('a'.repeat(1025)), false);
  assert.equal(validPassword('long password'), true);
});
