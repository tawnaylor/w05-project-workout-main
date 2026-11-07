import path from 'node:path';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import { expressMiddleware } from '@apollo/server/express4';
import { authRouter, configurePassport } from './auth';
import type { Config } from './config';
import { getClient } from './db';
import type { Context } from './graphql/context';
import { createApolloServer } from './graphql/server';
import { buildOpenApiSpec } from './openapi';

export const createApp = async (config: Config): Promise<express.Express> => {
  const app = express();
  app.set('trust proxy', 1);

  configurePassport();

  app.use(
    session({
      name: 'workoutquest.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ client: getClient() as never, dbName: config.dbName }),
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use('/auth', authRouter);

  const apollo = createApolloServer();
  await apollo.start();
  app.use(
    '/graphql',
    cors({ origin: true, credentials: true }),
    express.json({ limit: '100kb' }),
    expressMiddleware(apollo, {
      context: async ({ req }): Promise<Context> => ({ user: req.user ?? null })
    })
  );

  const publicDir = path.join(__dirname, '..', 'public');
  const openApiSpec = buildOpenApiSpec();
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));
  app.get('/api-docs', (_req, res) => res.sendFile(path.join(publicDir, 'api-docs.html')));
  app.get('/docs', (_req, res) => res.sendFile(path.join(publicDir, 'docs.html')));
  app.use(express.static(publicDir));

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
};
