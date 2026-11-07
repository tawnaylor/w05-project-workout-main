import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { ObjectId } from 'mongodb';
import type { Context } from '../src/graphql/context';
import { createApolloServer } from '../src/graphql/server';
import type { PlayerDoc } from '../src/types';

const server = createApolloServer();
after(() => server.stop());

const player: PlayerDoc = {
  _id: new ObjectId(),
  username: 'tester',
  displayName: 'Tester',
  email: 'tester@example.com',
  githubId: '1',
  avatarUrl: null,
  totalXp: 0,
  level: 1,
  createdAt: new Date(),
  createdBy: null
};

interface GqlError {
  message: string;
  extensions?: { code?: string; errors?: { field: string; message: string }[] };
}

const run = async (query: string, variables: Record<string, unknown>, user: PlayerDoc | null) => {
  const { body } = await server.executeOperation({ query, variables }, { contextValue: { user } satisfies Context });
  assert.equal(body.kind, 'single');
  if (body.kind !== 'single') throw new Error('unexpected incremental response');
  return { data: body.singleResult.data, errors: (body.singleResult.errors ?? []) as unknown as GqlError[] };
};

const CREATE = `mutation ($input: WorkoutInput!) { createWorkout(input: $input) { id name } }`;
const goodInput = { name: 'Leg Day', type: 'STRENGTH', difficulty: 7, durationMinutes: 50, xpReward: 220 };

test('writes require sign-in (UNAUTHENTICATED)', async () => {
  const mutations: [string, Record<string, unknown>][] = [
    [CREATE, { input: goodInput }],
    [`mutation { updateWorkout(id: "507f1f77bcf86cd799439011", input: ${'{name:"x",type:CARDIO,difficulty:1,durationMinutes:1,xpReward:0}'}) { id } }`, {}],
    [`mutation { deleteWorkout(id: "507f1f77bcf86cd799439011") { id } }`, {}],
    [`mutation { completeWorkout(id: "507f1f77bcf86cd799439011") { id } }`, {}],
    [`mutation { createPlayer(input: {username:"abc",displayName:"A",email:"a@b.co"}) { id } }`, {}],
    [`mutation { deletePlayer(id: "507f1f77bcf86cd799439011") { id } }`, {}]
  ];
  for (const [query, variables] of mutations) {
    const { errors } = await run(query, variables, null);
    assert.equal(errors[0]?.extensions?.code, 'UNAUTHENTICATED', query);
  }
});

test('invalid workout input returns BAD_USER_INPUT with every failing field', async () => {
  const { errors } = await run(CREATE, { input: { ...goodInput, difficulty: 11, name: '   ', durationMinutes: 0 } }, player);
  assert.equal(errors[0]?.extensions?.code, 'BAD_USER_INPUT');
  const fields = (errors[0]?.extensions?.errors ?? []).map((issue) => issue.field).sort();
  assert.deepEqual(fields, ['difficulty', 'durationMinutes', 'name']);
});

test('malformed ids return BAD_USER_INPUT before touching the database', async () => {
  for (const query of [
    `{ workout(id: "123") { id } }`,
    `{ player(id: "nope") { id } }`,
    `{ workouts(playerId: "bad") { id } }`,
    `mutation { deleteWorkout(id: "xyz") { id } }`
  ]) {
    const { errors } = await run(query, {}, player);
    assert.equal(errors[0]?.extensions?.code, 'BAD_USER_INPUT', query);
  }
});

test('GraphQL type checking rejects unknown enum values', async () => {
  const { errors } = await run(CREATE, { input: { ...goodInput, type: 'YOGA' } }, player);
  assert.ok(errors.length > 0);
});

test('me is null when signed out and returns the profile with email when signed in', async () => {
  assert.equal((await run('{ me { id } }', {}, null)).data?.me, null);
  const { data } = await run('{ me { username email level } }', {}, player);
  assert.deepEqual({ ...(data?.me as object) }, { username: 'tester', email: 'tester@example.com', level: 1 });
});

test('the schema exposes full CRUD for both collections', async () => {
  const { data } = await run(
    `{ query: __type(name: "Query") { fields { name } } mutation: __type(name: "Mutation") { fields { name } } }`,
    {},
    null
  );
  const names = (type: unknown): string[] => (type as { fields: { name: string }[] }).fields.map((f) => f.name);
  const queries = names(data?.query);
  const mutations = names(data?.mutation);
  for (const name of ['workouts', 'workout', 'players', 'player']) assert.ok(queries.includes(name), name);
  for (const name of ['createWorkout', 'updateWorkout', 'deleteWorkout', 'createPlayer', 'updatePlayer', 'deletePlayer']) {
    assert.ok(mutations.includes(name), name);
  }
});
