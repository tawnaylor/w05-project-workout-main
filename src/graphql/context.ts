import { apiError } from '../errors';
import type { PlayerDoc } from '../types';

export interface Context {
  user: PlayerDoc | null;
}

export const requireUser = (ctx: Context): PlayerDoc => {
  if (!ctx.user) {
    throw apiError('UNAUTHENTICATED', 'Sign in with GitHub at /auth/github before writing data');
  }
  return ctx.user;
};
