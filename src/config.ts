export const OAUTH_SETTINGS = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL'] as const;

/** Names (never values) of OAuth settings that are missing, empty, or whitespace-only. */
export const getMissingOAuthSettings = (env: NodeJS.ProcessEnv = process.env): string[] =>
  OAUTH_SETTINGS.filter((name) => !env[name]?.trim());

export interface Config {
  mongoUri: string;
  dbName: string;
  sessionSecret: string;
  port: number;
  production: boolean;
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const missing = ['MONGODB_URI', 'DB_NAME', 'SESSION_SECRET'].filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return {
    mongoUri: env.MONGODB_URI as string,
    dbName: env.DB_NAME as string,
    sessionSecret: env.SESSION_SECRET as string,
    port: Number(env.PORT) || 3000,
    production: env.NODE_ENV === 'production'
  };
};
