import assert from 'node:assert/strict';
import test from 'node:test';
import { authRouter } from '../src/auth';
import { buildOpenApiSpec } from '../src/openapi';

interface Operation {
  security?: Record<string, string[]>[];
}
type Spec = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, { type: string; flows?: Record<string, { scopes: Record<string, string> }> }> };
};

const spec = buildOpenApiSpec() as unknown as Spec;

test('spec declares GitHub OAuth 2.0 and the session cookie as security schemes', () => {
  assert.match(spec.openapi, /^3\.0\./);
  const { githubOAuth, sessionCookie } = spec.components.securitySchemes;
  assert.equal(githubOAuth?.type, 'oauth2');
  assert.ok(githubOAuth?.flows?.authorizationCode?.scopes['user:email']);
  assert.equal(sessionCookie?.type, 'apiKey');
});

test('every /auth route in the router is documented', () => {
  const stack = (authRouter as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack;
  const routes = stack.flatMap((layer) => (layer.route ? Object.keys(layer.route.methods).map((m) => [layer.route!.path, m] as const) : []));
  assert.ok(routes.length >= 4);
  for (const [path, method] of routes) {
    assert.ok(spec.paths[`/auth${path}`]?.[method], `${method.toUpperCase()} /auth${path} is missing from the spec`);
  }
});

test('protected and public routes are marked correctly', () => {
  assert.deepEqual(spec.paths['/auth/me']?.get?.security, [{ sessionCookie: [] }]);
  assert.deepEqual(spec.paths['/graphql']?.post?.security, [{}, { sessionCookie: [] }]);
  assert.equal(spec.paths['/health']?.get?.security, undefined);
});
