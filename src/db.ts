import { Collection, Db, MongoClient } from 'mongodb';
import type { PlayerDoc, WorkoutDoc } from './types';

let client: MongoClient | undefined;
let db: Db | undefined;

export const connectDb = async (uri: string, dbName: string): Promise<Db> => {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await Promise.all([
    db.collection('players').createIndex({ username: 1 }, { unique: true }),
    db.collection('players').createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
    ),
    db.collection('players').createIndex(
      { githubId: 1 },
      { unique: true, partialFilterExpression: { githubId: { $type: 'string' } } }
    ),
    db.collection('workouts').createIndex({ playerId: 1 })
  ]);
  return db;
};

export const getClient = (): MongoClient => {
  if (!client) throw new Error('Database not initialized');
  return client;
};

export const getDb = (): Db => {
  if (!db) throw new Error('Database not initialized');
  return db;
};

export const players = (): Collection<PlayerDoc> => getDb().collection<PlayerDoc>('players');
export const workouts = (): Collection<WorkoutDoc> => getDb().collection<WorkoutDoc>('workouts');

export const closeDb = async (): Promise<void> => {
  await client?.close();
  client = undefined;
  db = undefined;
};
