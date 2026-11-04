// Function-level CORS regression; no server, browser, network, or cloud writes.
// Run: node --import tsx app/lib/proxy.test.mjs
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy, config } from '../../proxy.ts';
import { POST } from '../api/records/route.ts';

const oldFrontend = process.env.TRIP_FRONTEND_ORIGIN;
const oldVercel = process.env.VERCEL;
const frontend = 'https://trip-owner.github.io';
const api = 'https://trip-api.vercel.app';
let cases = 0;
function request(method, origin = frontend, extra = {}, body) {
  return new NextRequest(`${api}/api/records`, { method, headers: { host: 'trip-api.vercel.app', ...(origin ? { origin } : {}), ...extra }, ...(body === undefined ? {} : { body }) });
}
function preflight({ origin = frontend, method = 'POST', headers = 'Content-Type, X-Trip-Editor', allow = true } = {}) {
  const response = proxy(request('OPTIONS', origin, { 'access-control-request-method': method, 'access-control-request-headers': headers }));
  assert.equal(response.status, allow ? 204 : 403);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.get('access-control-allow-origin'), allow ? frontend : null);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  if (allow) {
    assert.ok(response.headers.get('access-control-allow-methods').split(', ').includes(method));
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type, X-Trip-Editor');
    assert.equal(response.headers.get('access-control-max-age'), '600');
  } else {
    assert.equal(response.headers.get('access-control-allow-methods'), null);
    assert.equal(response.headers.get('access-control-allow-headers'), null);
  }
  cases++;
}

try {
  process.env.TRIP_FRONTEND_ORIGIN = frontend;
  process.env.VERCEL = '1';
  assert.deepEqual(config, { matcher: '/api/:path*' });
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']) preflight({ method });
  preflight({ headers: '  CONTENT-TYPE, x-Trip-Editor  ' });
  preflight({ headers: '' });
  preflight({ origin: 'https://another-owner.github.io', allow: false });
  preflight({ origin: 'https://trip-owner.github.io.evil.example', allow: false });
  preflight({ origin: 'http://trip-owner.github.io', allow: false });
  preflight({ origin: null, allow: false });
  preflight({ method: 'PATCH', allow: false });
  preflight({ method: '', allow: false });
  preflight({ headers: 'Authorization', allow: false });
  preflight({ headers: 'Content-Type, X-Unapproved-Header', allow: false });
  preflight({ headers: 'X-Forwarded-Host', allow: false });

  const allowed = proxy(request('GET', frontend, { 'x-trip-editor': '%E5%B4%94%E5%A4%A9%E7%90%B4' }));
  assert.equal(allowed.headers.get('x-middleware-next'), '1');
  assert.equal(allowed.headers.get('access-control-allow-origin'), frontend);
  assert.equal(allowed.headers.get('vary'), 'Origin');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  cases++;

  // Public reads can proceed, but a disallowed browser origin receives no
  // permission to consume them. API write handlers enforce their own policy.
  const disallowed = proxy(request('GET', 'https://evil.example', { 'x-forwarded-host': 'trip-owner.github.io' }));
  assert.equal(disallowed.headers.get('x-middleware-next'), '1');
  assert.equal(disallowed.headers.get('access-control-allow-origin'), null);
  cases++;

  // Call the actual handler with an invalid payload. It fails before database
  // access, while its middleware pass-through still carries CORS response
  // headers. Next is responsible for merging these into the final HTTP result.
  const invalid = request('POST', frontend, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, JSON.stringify({ type: 'hotel', data: { url: 'javascript:alert(1)' } }));
  const middleware = proxy(invalid);
  const errorResponse = await POST(invalid);
  assert.equal(errorResponse.status, 400);
  assert.match((await errorResponse.json()).error, /链接/);
  assert.equal(middleware.headers.get('x-middleware-next'), '1');
  assert.equal(middleware.headers.get('access-control-allow-origin'), frontend);
  assert.equal(middleware.headers.get('vary'), 'Origin');
  assert.equal(errorResponse.headers.get('access-control-allow-origin'), null, 'The handler must not overwrite proxy CORS policy');
  cases++;

  delete process.env.TRIP_FRONTEND_ORIGIN;
  preflight({ allow: false });
  const disabled = proxy(request('GET'));
  assert.equal(disabled.headers.get('access-control-allow-origin'), null);
  cases++;
  console.log(`PASS proxy CORS: ${cases} cases covering preflight, strict origin/header/method allowlists, normal/error pass-through, and disabled configuration`);
} finally {
  if (oldFrontend === undefined) delete process.env.TRIP_FRONTEND_ORIGIN; else process.env.TRIP_FRONTEND_ORIGIN = oldFrontend;
  if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
}
