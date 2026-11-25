import assert from 'node:assert/strict';
import test from 'node:test';
import { corsFor, exchangeCode, handleOauthRequest, validateExchangeBody } from './src/exchange.js';

const GOOD = {
  code: 'abc12345def',
  state: 'a'.repeat(32),
  redirect_uri: 'https://adminproac.github.io/HojaDeVida/auth/callback',
};

test('validateExchangeBody accepts a code, state and known redirect', () => {
  const parsed = validateExchangeBody(GOOD);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.redirectUri, GOOD.redirect_uri);
});

test('validateExchangeBody rejects a bad state, a short code and an unknown redirect', () => {
  assert.equal(validateExchangeBody({ ...GOOD, state: 'short' }).ok, false);
  assert.equal(validateExchangeBody({ ...GOOD, code: 'tiny' }).ok, false);
  assert.equal(validateExchangeBody({ ...GOOD, redirect_uri: 'https://evil.example/cb' }).ok, false);
  assert.equal(validateExchangeBody(null).ok, false);
});

test('CORS allows only the Pages origin and localhost:4200', () => {
  assert.equal(corsFor('https://adminproac.github.io')['Access-Control-Allow-Origin'], 'https://adminproac.github.io');
  assert.equal(corsFor('http://localhost:4200')['Access-Control-Allow-Origin'], 'http://localhost:4200');
  assert.equal(corsFor('https://evil.example'), null);
  assert.equal(corsFor(''), null);
});

test('exchange returns the token fields and does not log the token', async () => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = await exchangeCode(async () => new Response(JSON.stringify({
      access_token: 'gho_memory_only',
      scope: 'public_repo',
      token_type: 'bearer',
    }), { status: 200 }), {
      clientId: 'Iv1.public',
      clientSecret: 'secret-value',
      code: GOOD.code,
      redirectUri: GOOD.redirect_uri,
    });
    assert.deepEqual(result, { access_token: 'gho_memory_only', scope: 'public_repo', token_type: 'bearer' });
    assert.equal(logs.some((line) => line.includes('gho_memory_only') || line.includes('secret-value')), false);
  } finally {
    console.log = original;
  }
});

test('the worker rejects a foreign origin and does not echo the token on failure', async () => {
  const request = new Request('https://hojadevida-oauth.example.workers.dev/api/oauth/exchange', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify(GOOD),
  });
  const res = await handleOauthRequest(request, { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' }, async () => {
    throw new Error('fetch should not run');
  });
  assert.equal(res.status, 403);
  const text = await res.text();
  assert.equal(text.includes('access_token'), false);
});
