import type { Filter } from 'mongodb';
import { apiError, parseInput, parseObjectId } from '../errors';
import { players, workouts } from '../db';
import { WORKOUT_TYPES, XP_PER_LEVEL, type PlayerDoc, type WorkoutDoc } from '../types';
import { playerInputSchema, workoutFilterSchema, workoutInputSchema } from '../validation';
import { requireUser, type Context } from './context';

const canManagePlayer = (target: PlayerDoc, user: PlayerDoc): boolean =>
  target._id.equals(user._id) || Boolean(target.createdBy?.equals(user._id));

const loadOwnedWorkout = async (id: string, user: PlayerDoc): Promise<WorkoutDoc> => {
  const _id = parseObjectId(id);
  const workout = await workouts().findOne({ _id });
  if (!workout) throw apiError('NOT_FOUND', 'Workout not found');
  if (!workout.playerId.equals(user._id)) throw apiError('FORBIDDEN', 'You can only change your own workouts');
  return workout;
};

const loadManagedPlayer = async (id: string, user: PlayerDoc): Promise<PlayerDoc> => {
  const _id = parseObjectId(id);
  const player = await players().findOne({ _id });
  if (!player) throw apiError('NOT_FOUND', 'Player not found');
  if (!canManagePlayer(player, user)) {
    throw apiError('FORBIDDEN', 'You can only change your own profile or profiles you created');
  }
  return player;
};

const enumValues = Object.fromEntries(WORKOUT_TYPES.map((type) => [type.toUpperCase(), type]));

export const resolvers = {
  WorkoutType: enumValues,

  Query: {
    workouts: async (_: unknown, args: { type?: string; completed?: boolean; playerId?: string }) => {
      const filter = parseInput(workoutFilterSchema, {
        type: args.type ?? undefined,
        completed: args.completed ?? undefined,
        playerId: args.playerId ?? undefined
      });
      const query: Filter<WorkoutDoc> = {};
      if (filter.type) query.type = filter.type;
      if (filter.completed !== undefined) query.completed = filter.completed;
      if (filter.playerId) query.playerId = parseObjectId(filter.playerId, 'playerId');
      return workouts().find(query).sort({ _id: -1 }).toArray();
    },

    workout: async (_: unknown, args: { id: string }) => {
      const _id = parseObjectId(args.id);
      return workouts().findOne({ _id });
    },

    players: async () => players().find().sort({ totalXp: -1, _id: 1 }).toArray(),

    player: async (_: unknown, args: { id: string }) => {
      const _id = parseObjectId(args.id);
      return players().findOne({ _id });
    },

    me: (_: unknown, __: unknown, ctx: Context) => ctx.user
  },

  Mutation: {
    createWorkout: async (_: unknown, args: { input: unknown }, ctx: Context) => {
      const user = requireUser(ctx);
      const input = parseInput(workoutInputSchema, args.input);
      const doc: Omit<WorkoutDoc, '_id'> = {
        ...input,
        completedAt: input.completed ? new Date() : null,
        playerId: user._id
      };
      const result = await workouts().insertOne(doc as WorkoutDoc);
      return { ...doc, _id: result.insertedId };
    },

    updateWorkout: async (_: unknown, args: { id: string; input: unknown }, ctx: Context) => {
      const user = requireUser(ctx);
      const input = parseInput(workoutInputSchema, args.input);
      const existing = await loadOwnedWorkout(args.id, user);
      const replacement: WorkoutDoc = {
        ...input,
        _id: existing._id,
        playerId: existing.playerId,
        completedAt: input.completed ? (existing.completedAt ?? new Date()) : null
      };
      await workouts().replaceOne({ _id: existing._id }, replacement);
      return replacement;
    },

    completeWorkout: async (_: unknown, args: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const existing = await loadOwnedWorkout(args.id, user);
      const completed = await workouts().findOneAndUpdate(
        { _id: existing._id, completed: false },
        { $set: { completed: true, completedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!completed) throw apiError('CONFLICT', 'Workout is already completed');
      await players().updateOne({ _id: user._id }, [
        { $set: { totalXp: { $add: ['$totalXp', completed.xpReward] } } },
        { $set: { level: { $add: [{ $floor: { $divide: ['$totalXp', XP_PER_LEVEL] } }, 1] } } }
      ]);
      return completed;
    },

    deleteWorkout: async (_: unknown, args: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const existing = await loadOwnedWorkout(args.id, user);
      const result = await workouts().deleteOne({ _id: existing._id });
      return { id: args.id, deleted: result.deletedCount === 1 };
    },

    createPlayer: async (_: unknown, args: { input: unknown }, ctx: Context) => {
      const user = requireUser(ctx);
      const input = parseInput(playerInputSchema, args.input);
      const doc: Omit<PlayerDoc, '_id'> = {
        username: input.username,
        displayName: input.displayName,
        email: input.email,
        githubId: null,
        avatarUrl: input.avatarUrl ?? null,
        totalXp: 0,
        level: 1,
        createdAt: new Date(),
        createdBy: user._id
      };
      const result = await players().insertOne(doc as PlayerDoc);
      return { ...doc, _id: result.insertedId };
    },

    updatePlayer: async (_: unknown, args: { id: string; input: unknown }, ctx: Context) => {
      const user = requireUser(ctx);
      const input = parseInput(playerInputSchema, args.input);
      const existing = await loadManagedPlayer(args.id, user);
      const updated: PlayerDoc = {
        ...existing,
        username: input.username,
        displayName: input.displayName,
        email: input.email,
        avatarUrl: input.avatarUrl ?? null
      };
      await players().replaceOne({ _id: existing._id }, updated);
      return updated;
    },

    deletePlayer: async (_: unknown, args: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const existing = await loadManagedPlayer(args.id, user);
      await workouts().deleteMany({ playerId: existing._id });
      const result = await players().deleteOne({ _id: existing._id });
      return { id: args.id, deleted: result.deletedCount === 1 };
    }
  },

  Workout: {
    id: (workout: WorkoutDoc) => workout._id.toHexString(),
    playerId: (workout: WorkoutDoc) => workout.playerId.toHexString(),
    completedAt: (workout: WorkoutDoc) => workout.completedAt?.toISOString() ?? null,
    player: (workout: WorkoutDoc) => players().findOne({ _id: workout.playerId })
  },

  Player: {
    id: (player: PlayerDoc) => player._id.toHexString(),
    email: (player: PlayerDoc, _: unknown, ctx: Context) =>
      ctx.user && ctx.user._id.equals(player._id) ? player.email : null,
    createdAt: (player: PlayerDoc) => player.createdAt.toISOString(),
    workouts: (player: PlayerDoc) => workouts().find({ playerId: player._id }).sort({ _id: -1 }).toArray()
  }
};
