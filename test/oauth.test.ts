import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { requireOAuth } from '../src/auth';
import { getMissingOAuthSettings, OAUTH_SETTINGS } from '../src/config';

const settings = {
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback'
};

const withOAuthEnv = (t: test.TestContext, env: Partial<typeof settings>): void => {
  const original = Object.fromEntries(OAUTH_SETTINGS.map((name) => [name, process.env[name]]));
  for (const name of OAUTH_SETTINGS) {
    const value = env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
};

test('OAuth configuration identifies missing, empty, and whitespace-only settings', () => {
  assert.deepEqual(getMissingOAuthSettings({}), [...OAUTH_SETTINGS]);
  for (const name of OAUTH_SETTINGS) {
    for (const value of [undefined, '', ' \t ']) {
      assert.deepEqual(getMissingOAuthSettings({ ...settings, [name]: value }), [name]);
    }
  }
  assert.deepEqual(getMissingOAuthSettings(settings), []);
});

test('OAuth guard returns 503 with missing names but no configuration values', (t) => {
  withOAuthEnv(t, { ...settings, GITHUB_CLIENT_SECRET: '' });
  let status = 0;
  let body: { missingVariables: string[]; message: string } | undefined;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: typeof body) {
      body = payload;
      return this;
    }
  } as unknown as Response;
  requireOAuth({} as Request, res, () => assert.fail('OAuth must remain disabled'));
  assert.equal(status, 503);
  assert.deepEqual(body?.missingVariables, ['GITHUB_CLIENT_SECRET']);
  assert.match(body?.message ?? '', /restart/i);
  for (const value of Object.values(settings)) {
    assert.ok(!JSON.stringify(body).includes(value));
  }
});

test('OAuth guard allows configured requests to continue', (t) => {
  withOAuthEnv(t, settings);
  let continued = false;
  requireOAuth({} as Request, {} as Response, () => {
    continued = true;
  });
  assert.equal(continued, true);
});
