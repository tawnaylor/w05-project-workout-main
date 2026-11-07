import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy, type Profile } from 'passport-github2';
import { ObjectId } from 'mongodb';
import { getMissingOAuthSettings } from './config';
import { players } from './db';
import type { PlayerDoc } from './types';

const findOrCreatePlayer = async (profile: Profile): Promise<PlayerDoc> => {
  const existing = await players().findOne({ githubId: profile.id });
  if (existing) return existing;

  const baseUsername = (profile.username || `github-${profile.id}`).replace(/[^A-Za-z0-9_-]/g, '-');
  let username = baseUsername.slice(0, 30);
  if (await players().findOne({ username })) {
    username = `${baseUsername.slice(0, 20)}-${profile.id.slice(-8)}`;
  }
  const doc: Omit<PlayerDoc, '_id'> = {
    username,
    displayName: profile.displayName || baseUsername,
    email: profile.emails?.[0]?.value?.toLowerCase() ?? null,
    githubId: profile.id,
    avatarUrl: profile.photos?.[0]?.value ?? null,
    totalXp: 0,
    level: 1,
    createdAt: new Date(),
    createdBy: null
  };
  const result = await players().insertOne(doc as PlayerDoc);
  return { ...doc, _id: result.insertedId };
};

/** Registers the GitHub strategy when configured and the session (de)serializers. */
export const configurePassport = (env: NodeJS.ProcessEnv = process.env): void => {
  const missing = getMissingOAuthSettings(env);
  if (missing.length > 0) {
    console.warn(
      `GitHub OAuth is disabled. Missing environment variables: ${missing.join(', ')}. Configure them and restart the service.`
    );
  } else {
    passport.use(
      new GitHubStrategy(
        {
          clientID: env.GITHUB_CLIENT_ID as string,
          clientSecret: env.GITHUB_CLIENT_SECRET as string,
          callbackURL: env.GITHUB_CALLBACK_URL as string,
          scope: ['user:email']
        },
        (
          _accessToken: string,
          _refreshToken: string,
          profile: Profile,
          done: (error: unknown, user?: Express.User) => void
        ) => {
          findOrCreatePlayer(profile).then((player) => done(null, player), (error: unknown) => done(error));
        }
      )
    );
  }

  passport.serializeUser((user, done) => done(null, (user as PlayerDoc)._id.toHexString()));
  passport.deserializeUser((id: string, done) => {
    players()
      .findOne({ _id: new ObjectId(id) })
      .then((player) => done(null, player ?? false), (error: unknown) => done(error));
  });
};

/** Responds 503 (listing missing variable names, never values) when OAuth is not configured. */
export const requireOAuth = (_req: Request, res: Response, next: NextFunction): void => {
  const missingVariables = getMissingOAuthSettings();
  if (missingVariables.length === 0) {
    next();
    return;
  }
  res.status(503).json({
    message: 'GitHub OAuth is not configured. Set the missing environment variables and restart the service.',
    missingVariables
  });
};

export const authRouter = Router();

authRouter.get('/github', requireOAuth, passport.authenticate('github', { scope: ['user:email'] }));

authRouter.get(
  '/github/callback',
  requireOAuth,
  passport.authenticate('github', { failureRedirect: '/?signin=failed' }),
  (_req, res) => res.redirect('/')
);

authRouter.post('/logout', (req, res, next) => {
  req.logout((error) => {
    if (error) {
      next(error);
      return;
    }
    req.session.destroy(() => {
      res.clearCookie('workoutquest.sid');
      res.status(200).json({ message: 'Signed out' });
    });
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ message: 'Not signed in' });
    return;
  }
  const { _id, username, displayName, email, level, totalXp } = req.user;
  res.status(200).json({ id: _id.toHexString(), username, displayName, email, level, totalXp });
});
