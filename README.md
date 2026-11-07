# WorkoutQuest

A workout tracker where finishing a workout earns XP and levels you up. It is a TypeScript Node project with a GraphQL API, MongoDB storage, GitHub OAuth, and a web UI served by the same server.

- **App:** `/`
- **API docs:** `/docs` (guide, live schema reference, and a console for trying calls)
- **GraphQL endpoint:** `POST /graphql` (opens an interactive explorer when visited in a browser)

## Stack

| Piece | Choice |
| --- | --- |
| Language | TypeScript (strict) for the server, tests, and the browser code |
| API | GraphQL with Apollo Server 4 on Express |
| Database | MongoDB (`players` and `workouts` collections) |
| Auth | GitHub OAuth through Passport, sessions stored in MongoDB |
| Validation | zod schemas on every mutation input and filter |
| UI | Static pages in `public/`, behavior in `src/client/*.ts` compiled to `public/js` |

## Data model

`players` (9 fields, plus `_id`): `username`, `displayName`, `email`, `githubId`, `avatarUrl`, `totalXp`, `level`, `createdAt`, `createdBy`.

`workouts` (9 fields, plus `_id`): `name`, `type` (strength, cardio, mobility), `difficulty` (1-10), `durationMinutes`, `xpReward`, `exercises` (name, sets, reps), `completed`, `completedAt`, `playerId`.

Level is `floor(totalXp / 500) + 1`. XP changes only by completing a workout, so players cannot edit their own XP.

## Operations

Reads are public. Every mutation needs a signed-in player.

| HTTP idea | Workouts | Players |
| --- | --- | --- |
| GET | `workouts`, `workout(id)` | `players`, `player(id)`, `me` |
| POST | `createWorkout` | `createPlayer` |
| PUT | `updateWorkout` (replaces all fields) | `updatePlayer` (replaces all fields) |
| DELETE | `deleteWorkout` | `deletePlayer` (also removes that player's workouts) |

`completeWorkout(id)` marks one of your workouts done and awards its XP once.

Validation failures return `BAD_USER_INPUT` with a `field` and `message` for each problem. Other codes are `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, and `CONFLICT`. Full details and examples are on the `/docs` page.

## Run it locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and fill in `MONGODB_URI` and a long random `SESSION_SECRET`.
3. Create a GitHub OAuth App (Settings, Developer settings, OAuth Apps) with the callback URL `http://localhost:3000/auth/github/callback`. Put its client ID and secret in `.env`.
4. Run `npm install`, then `npm run build`, then `npm run dev` (or `npm start` to run the built output).

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs the server with auto-reload through `tsx` |
| `npm run build` | Compiles the server to `dist/` and the browser code to `public/js/` |
| `npm start` | Runs `dist/server.js` |
| `npm run typecheck` | Type-checks server and client without emitting files |
| `npm test` | Runs the tests |

While developing, rebuild the browser code with `npx tsc -p tsconfig.client.json --watch`.

## Deploy to Render

1. Create a Web Service from this repository. `render.yaml` holds the settings, or enter them by hand:
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/health`
2. Set these environment variables: `MONGODB_URI`, `DB_NAME`, `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `NODE_ENV=production`, and `NODE_VERSION=22`. Do not set `PORT`; Render supplies it.
3. Set `GITHUB_CALLBACK_URL` to `https://<your-service>.onrender.com/auth/github/callback`, and use the same URL as the **Authorization callback URL** in a GitHub OAuth App. Use a separate OAuth App for local development.
4. In MongoDB Atlas, allow Render to connect (Network Access, then add `0.0.0.0/0` for a class project).
5. Redeploy. Open `/health`, then `/docs`, then sign in from the app.

The API can be called from other origins. The session cookie is `SameSite=Lax`, so authenticated calls work from the app and the `/docs` console on the same origin, while public queries work from anywhere.

### Troubleshooting sign-in

A `503` from `/auth/github` means OAuth settings are missing. The response lists the missing variable names (never values). Add them in Render's Environment settings and redeploy, because Passport registers its strategy at startup. If GitHub rejects the callback, check that `GITHUB_CALLBACK_URL` and the OAuth App's callback URL match exactly. Never paste client secrets into chat, screenshots, or recordings.

## Project layout

```
src/
  server.ts            starts the database and the HTTP server
  app.ts               Express wiring: sessions, auth routes, /graphql, static files
  auth.ts              GitHub strategy and /auth routes
  config.ts            environment handling
  db.ts                MongoDB connection, indexes, typed collections
  errors.ts            error codes, input parsing, central error formatting
  validation.ts        zod schemas
  graphql/             schema, resolvers, context, Apollo setup
  client/              browser TypeScript for the app and docs page
public/                HTML and CSS
test/                  unit tests (validation, OAuth guard, GraphQL errors)
```
