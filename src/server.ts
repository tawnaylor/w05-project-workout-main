import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { closeDb, connectDb } from './db';

const start = async (): Promise<void> => {
  const config = loadConfig();
  await connectDb(config.mongoUri, config.dbName);
  const app = await createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`WorkoutQuest GraphQL API listening on port ${config.port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      closeDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((error: unknown) => {
  console.error('Failed to start WorkoutQuest API:', error instanceof Error ? error.message : error);
  process.exit(1);
});
