import { z } from 'zod';
import { WORKOUT_TYPES } from './types';

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, 'exercise name is required').max(80),
  sets: z.number().int().min(1, 'sets must be at least 1').max(100),
  reps: z.number().int().min(1, 'reps must be at least 1').max(1000)
});

export const workoutInputSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name must be 100 characters or fewer'),
  type: z.enum(WORKOUT_TYPES, { errorMap: () => ({ message: 'type must be strength, cardio, or mobility' }) }),
  difficulty: z.number().int('difficulty must be a whole number').min(1, 'difficulty must be 1-10').max(10, 'difficulty must be 1-10'),
  durationMinutes: z
    .number()
    .int('durationMinutes must be a whole number')
    .min(1, 'durationMinutes must be 1-300')
    .max(300, 'durationMinutes must be 1-300'),
  xpReward: z.number().int('xpReward must be a whole number').min(0, 'xpReward must be 0 or more').max(10000, 'xpReward must be 10000 or fewer'),
  exercises: z.array(exerciseSchema).max(50, 'a workout can have at most 50 exercises').default([]),
  completed: z.boolean().default(false)
});
export type WorkoutInput = z.infer<typeof workoutInputSchema>;

export const playerInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'username must be 3-30 characters')
    .max(30, 'username must be 3-30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'username may only contain letters, numbers, underscores, and hyphens'),
  displayName: z.string().trim().min(1, 'displayName is required').max(60, 'displayName must be 60 characters or fewer'),
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  avatarUrl: z.string().trim().url('avatarUrl must be a URL').nullish()
});
export type PlayerInput = z.infer<typeof playerInputSchema>;

export const workoutFilterSchema = z.object({
  type: z.enum(WORKOUT_TYPES).optional(),
  completed: z.boolean().optional(),
  playerId: z.string().optional()
});
