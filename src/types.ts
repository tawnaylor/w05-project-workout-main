import type { ObjectId } from 'mongodb';

export const WORKOUT_TYPES = ['strength', 'cardio', 'mobility'] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export const XP_PER_LEVEL = 500;
export const levelForXp = (xp: number): number => Math.floor(xp / XP_PER_LEVEL) + 1;

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
}

/** Document shape of the `players` collection (9 fields plus `_id`). */
export interface PlayerDoc {
  _id: ObjectId;
  username: string;
  displayName: string;
  email: string | null;
  githubId: string | null;
  avatarUrl: string | null;
  totalXp: number;
  level: number;
  createdAt: Date;
  createdBy: ObjectId | null;
}

/** Document shape of the `workouts` collection (9 fields plus `_id`). */
export interface WorkoutDoc {
  _id: ObjectId;
  name: string;
  type: WorkoutType;
  difficulty: number;
  durationMinutes: number;
  xpReward: number;
  exercises: Exercise[];
  completed: boolean;
  completedAt: Date | null;
  playerId: ObjectId;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Passport stores the signed-in player on req.user.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends PlayerDoc {}
  }
}
