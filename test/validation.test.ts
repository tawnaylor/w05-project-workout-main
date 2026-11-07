import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInput, parseObjectId } from '../src/errors';
import { playerInputSchema, workoutInputSchema } from '../src/validation';

const validWorkout = { name: ' Push Day ', type: 'strength', difficulty: 5, durationMinutes: 45, xpReward: 150 };

const codeOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return (error as { extensions?: { code?: string } }).extensions?.code;
  }
  return undefined;
};

test('workout input is trimmed and gets defaults', () => {
  const result = parseInput(workoutInputSchema, validWorkout);
  assert.equal(result.name, 'Push Day');
  assert.deepEqual(result.exercises, []);
  assert.equal(result.completed, false);
});

test('workout input rejects out-of-range difficulty with a field-level error', () => {
  try {
    parseInput(workoutInputSchema, { ...validWorkout, difficulty: 11 });
    assert.fail('expected validation to throw');
  } catch (error) {
    const { extensions } = error as { extensions: { code: string; errors: { field: string }[] } };
    assert.equal(extensions.code, 'BAD_USER_INPUT');
    assert.ok(extensions.errors.some((issue) => issue.field === 'difficulty'));
  }
});

test('workout input rejects unknown types and bad exercises', () => {
  assert.equal(codeOf(() => parseInput(workoutInputSchema, { ...validWorkout, type: 'yoga' })), 'BAD_USER_INPUT');
  assert.equal(
    codeOf(() => parseInput(workoutInputSchema, { ...validWorkout, exercises: [{ name: '', sets: 0, reps: 5 }] })),
    'BAD_USER_INPUT'
  );
});

test('player input normalizes email and rejects malformed values', () => {
  const ok = parseInput(playerInputSchema, { username: 'workout_fan', displayName: 'Fan', email: ' Fan@Example.COM ' });
  assert.equal(ok.email, 'fan@example.com');
  assert.equal(codeOf(() => parseInput(playerInputSchema, { username: 'ab', displayName: 'x', email: 'a@b.co' })), 'BAD_USER_INPUT');
  assert.equal(codeOf(() => parseInput(playerInputSchema, { username: 'fine_name', displayName: 'x', email: 'nope' })), 'BAD_USER_INPUT');
  assert.equal(
    codeOf(() => parseInput(playerInputSchema, { username: 'fine_name', displayName: 'x', email: 'a@b.co', avatarUrl: 'not a url' })),
    'BAD_USER_INPUT'
  );
});

test('ids must be 24-character hex MongoDB ids', () => {
  assert.equal(parseObjectId('507f1f77bcf86cd799439011').toHexString(), '507f1f77bcf86cd799439011');
  assert.equal(codeOf(() => parseObjectId('123')), 'BAD_USER_INPUT');
  assert.equal(codeOf(() => parseObjectId('zzzzzzzzzzzzzzzzzzzzzzzz')), 'BAD_USER_INPUT');
});
