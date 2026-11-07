/**
 * OpenAPI 3.0 description of the HTTP surface: the GitHub OAuth routes, the GraphQL endpoint,
 * and the health check. It is served at /openapi.json and rendered by Swagger UI at /api-docs.
 */
export type OpenApiDocument = Record<string, unknown>;

const jsonBody = (schemaRef: string, description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaRef}` } } }
});

export const buildOpenApiSpec = (): OpenApiDocument => ({
  openapi: '3.0.3',
  info: {
    title: 'WorkoutQuest API',
    version: '2.0.0',
    description: [
      'WorkoutQuest is a GraphQL workout tracker. All data operations go through one endpoint, `POST /graphql`.',
      '',
      '**Security.** Sign-in uses GitHub OAuth 2.0 (authorization code flow) through Passport. After GitHub redirects back, the server starts a session and sets the `workoutquest.sid` cookie. No passwords are collected or stored.',
      '',
      '- Public: every GraphQL query except `me` (which returns `null` when signed out), `GET /health`, and the sign-in routes.',
      '- Requires sign-in: every GraphQL mutation (`UNAUTHENTICATED` error otherwise) and `GET /auth/me` (`401` otherwise).',
      '- Ownership: you can only change workouts you own, and player profiles that are yours or that you created (`FORBIDDEN` otherwise). A player `email` is only returned to that player.',
      '',
      '**Trying protected calls here.** Swagger UI cannot complete the GitHub token exchange itself because GitHub does not allow browser (CORS) calls to its token endpoint. Instead, open `/auth/github` in this browser, sign in, then return to this page. Requests from "Try it out" are same-origin and carry the session cookie automatically.'
    ].join('\n')
  },
  servers: [{ url: '/', description: 'This server' }],
  tags: [
    { name: 'Auth', description: 'GitHub OAuth sign-in, session, and sign-out.' },
    { name: 'GraphQL', description: 'The single data endpoint. Queries are public, mutations need sign-in.' },
    { name: 'System', description: 'Operational endpoints.' }
  ],
  paths: {
    '/auth/github': {
      get: {
        tags: ['Auth'],
        summary: 'Start GitHub sign-in',
        description:
          'Redirects the browser to GitHub to authorize the app (scope `user:email`). Creating an account and logging in are the same step: a player is created the first time a GitHub account signs in. Returns 503 when the server has no OAuth settings.',
        responses: {
          '302': { description: 'Redirect to GitHub authorization page.', headers: { Location: { schema: { type: 'string', format: 'uri' } } } },
          '503': jsonBody('OAuthNotConfigured', 'OAuth environment variables are missing. The body lists variable names only, never values.')
        }
      }
    },
    '/auth/github/callback': {
      get: {
        tags: ['Auth'],
        summary: 'GitHub OAuth callback',
        description:
          'GitHub redirects here after the user approves. The server exchanges the code, finds or creates the player, starts a session (sets the `workoutquest.sid` cookie), and redirects to `/`. On failure it redirects to `/?signin=failed`.',
        security: [{ githubOAuth: ['user:email'] }],
        parameters: [
          { name: 'code', in: 'query', required: false, description: 'Authorization code issued by GitHub.', schema: { type: 'string' } },
          { name: 'state', in: 'query', required: false, description: 'Opaque value echoed back by GitHub.', schema: { type: 'string' } }
        ],
        responses: {
          '302': {
            description: 'Redirect to `/` on success (with the session cookie set) or to `/?signin=failed` when GitHub rejects the sign-in.',
            headers: { 'Set-Cookie': { description: 'Session cookie `workoutquest.sid` (HttpOnly, SameSite=Lax, 7 days).', schema: { type: 'string' } } }
          },
          '503': jsonBody('OAuthNotConfigured', 'OAuth environment variables are missing.')
        }
      }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current signed-in player',
        description: 'Returns the signed-in player, including their own email. Requires an active session.',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': jsonBody('SessionPlayer', 'The signed-in player.'),
          '401': jsonBody('Message', 'Not signed in.')
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out',
        description: 'Ends the session, destroys it in MongoDB, and clears the `workoutquest.sid` cookie. Safe to call when already signed out.',
        responses: {
          '200': jsonBody('Message', 'Signed out.')
        }
      }
    },
    '/graphql': {
      post: {
        tags: ['GraphQL'],
        summary: 'Run a GraphQL query or mutation',
        description: [
          'Send `{ "query": "...", "variables": {...} }`. Errors are returned in the GraphQL `errors` array; branch on `extensions.code`.',
          '',
          '| Operation | Access |',
          '| --- | --- |',
          '| `workouts`, `workout`, `players`, `player` | Public |',
          '| `me` | Public (returns `null` when signed out) |',
          '| `createWorkout`, `updateWorkout`, `completeWorkout`, `deleteWorkout` | Signed in; workout must be yours |',
          '| `createPlayer` | Signed in |',
          '| `updatePlayer`, `deletePlayer` | Signed in; profile must be yours or created by you |',
          '',
          'Security is optional at the HTTP level (`{}`) because queries work without it. A mutation sent without a valid session cookie fails with `UNAUTHENTICATED`.'
        ].join('\n'),
        security: [{}, { sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GraphQLRequest' },
              examples: {
                publicQuery: {
                  summary: 'Public query (no sign-in)',
                  value: { query: '{ workouts { id name type xpReward } }' }
                },
                whoAmI: {
                  summary: 'Current player or null',
                  value: { query: '{ me { id username email level totalXp } }' }
                },
                protectedMutation: {
                  summary: 'Mutation (requires sign-in)',
                  value: {
                    query: 'mutation ($input: WorkoutInput!) { createWorkout(input: $input) { id name } }',
                    variables: { input: { name: 'Leg Day', type: 'STRENGTH', difficulty: 7, durationMinutes: 50, xpReward: 220 } }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description:
              'GraphQL response. Check `errors`: `UNAUTHENTICATED` (mutation without sign-in), `FORBIDDEN` (not your record), `NOT_FOUND`, `BAD_USER_INPUT` (validation or malformed id), `CONFLICT`.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GraphQLResponse' },
                examples: {
                  unauthenticated: {
                    summary: 'Mutation sent while signed out',
                    value: {
                      errors: [{ message: 'Sign in with GitHub at /auth/github before writing data', extensions: { code: 'UNAUTHENTICATED' } }],
                      data: null
                    }
                  }
                }
              }
            }
          },
          '400': { description: 'Malformed request body or a GraphQL document that fails to parse or validate.' }
        }
      }
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Used by the hosting platform. Public.',
        responses: {
          '200': {
            description: 'Service is up.',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      githubOAuth: {
        type: 'oauth2',
        description:
          'GitHub OAuth 2.0 authorization code flow. The server holds the client secret; browsers start the flow at `GET /auth/github`.',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            scopes: { 'user:email': 'Read the account email address so it can be shown back to the player.' }
          }
        }
      },
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'workoutquest.sid',
        description: 'Session cookie set after a successful GitHub sign-in. Required for protected routes and GraphQL mutations.'
      }
    },
    schemas: {
      Message: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', example: 'Not signed in' } }
      },
      OAuthNotConfigured: {
        type: 'object',
        required: ['message', 'missingVariables'],
        properties: {
          message: { type: 'string' },
          missingVariables: { type: 'array', items: { type: 'string' }, example: ['GITHUB_CLIENT_SECRET'] }
        }
      },
      SessionPlayer: {
        type: 'object',
        required: ['id', 'username', 'displayName', 'email', 'level', 'totalXp'],
        properties: {
          id: { type: 'string', example: '507f1f77bcf86cd799439011' },
          username: { type: 'string' },
          displayName: { type: 'string' },
          email: { type: 'string', nullable: true },
          level: { type: 'integer', example: 1 },
          totalXp: { type: 'integer', example: 0 }
        }
      },
      GraphQLRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          variables: { type: 'object', additionalProperties: true },
          operationName: { type: 'string' }
        }
      },
      GraphQLResponse: {
        type: 'object',
        properties: {
          data: { type: 'object', nullable: true, additionalProperties: true },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                extensions: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', enum: ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'BAD_USER_INPUT', 'CONFLICT', 'INTERNAL_SERVER_ERROR'] },
                    errors: {
                      type: 'array',
                      description: 'Present for BAD_USER_INPUT: one entry per failing field.',
                      items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});
