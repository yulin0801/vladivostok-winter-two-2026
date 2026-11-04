// No server, database, cloud credentials, or network required.
// Run: node --import tsx app/lib/server.test.mjs
import assert from 'node:assert/strict';
import { sameOrigin } from './server.ts';
import { getAllowedFrontendOrigin, isAllowedFrontendOrigin } from './origin.ts';

const previousVercel = process.env.VERCEL;
const previousFrontendOrigin = process.env.TRIP_FRONTEND_ORIGIN;
let checked = 0;
function verify({ name, url = 'http://localhost:3030/api/records', host = '127.0.0.1:3030', origin = 'http://127.0.0.1:3030', headers = {}, hosted = false, allow = false }) {
  if (hosted) process.env.VERCEL = '1'; else delete process.env.VERCEL;
  const request = new Request(url, { method: 'POST', headers: { ...(host === null ? {} : { Host: host }), ...(origin === null ? {} : { Origin: origin }), ...headers } });
  if (allow) assert.doesNotThrow(() => sameOrigin(request), name);
  else assert.throws(() => sameOrigin(request), error => error.status === 403, name);
  checked++;
}

try {
  delete process.env.TRIP_FRONTEND_ORIGIN;
  verify({ name: 'Next localhost URL normalization uses actual IPv4 Host', allow: true });
  verify({ name: 'Normal localhost Host', host: 'localhost:3030', origin: 'http://localhost:3030', allow: true });
  verify({ name: 'IPv6 Host including port', host: '[::1]:3030', origin: 'http://[::1]:3030', allow: true });
  verify({ name: 'Missing Host safely falls back to URL authority', host: null, origin: 'http://localhost:3030', allow: true });
  verify({ name: 'Wrong port is a different origin', origin: 'http://127.0.0.1:3031' });
  verify({ name: 'Wrong hostname is a different origin', origin: 'http://localhost:3030' });
  verify({ name: 'Cross-site metadata is rejected even for matching origin', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  verify({ name: 'Sibling same-site domain is not same origin', host: 'trip.example.com', origin: 'http://other.example.com', headers: { 'Sec-Fetch-Site': 'same-site' } });
  verify({ name: 'Missing Origin fails closed', origin: null });
  verify({ name: 'Opaque null origin rejected', origin: 'null' });
  verify({ name: 'Origin path rejected', origin: 'http://127.0.0.1:3030/path' });
  verify({ name: 'Origin credentials rejected', origin: 'http://user@127.0.0.1:3030' });
  verify({ name: 'Origin fragment rejected', origin: 'http://127.0.0.1:3030#fragment' });
  verify({ name: 'Multiple origins rejected', origin: 'http://127.0.0.1:3030 https://evil.example' });
  verify({ name: 'Non-HTTP origin rejected', origin: 'ftp://127.0.0.1:3030' });
  verify({ name: 'Host cannot contain URL userinfo', host: 'evil.example@127.0.0.1:3030' });
  verify({ name: 'Host cannot contain a path', host: '127.0.0.1:3030/path' });
  verify({ name: 'Host cannot contain multiple authorities', host: '127.0.0.1:3030,evil.example' });
  verify({ name: 'Forged forwarded hostname does not authorize another origin', origin: 'http://evil.example', headers: { 'X-Forwarded-Host': 'evil.example' } });
  verify({ name: 'Unrelated forwarded hostname does not break a valid origin', headers: { 'X-Forwarded-Host': 'evil.example' }, allow: true });
  verify({ name: 'Forged forwarded protocol cannot permit local HTTPS origin', origin: 'https://127.0.0.1:3030', headers: { 'X-Forwarded-Proto': 'https' } });
  verify({ name: 'Vercel TLS termination permits HTTPS using actual Host', hosted: true, host: 'trip.vercel.app', origin: 'https://trip.vercel.app', allow: true });
  verify({ name: 'Vercel never allows an HTTP Origin', hosted: true, host: 'trip.vercel.app', origin: 'http://trip.vercel.app' });
  verify({ name: 'Vercel ignores forged proxy headers', hosted: true, host: 'trip.vercel.app', origin: 'https://evil.example', headers: { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https' } });
  verify({ name: 'Direct HTTPS custom domain allowed locally', url: 'https://localhost/api/records', host: 'trip.example.com', origin: 'https://trip.example.com', allow: true });
  process.env.TRIP_FRONTEND_ORIGIN = 'https://trip-owner.github.io';
  assert.equal(getAllowedFrontendOrigin(), 'https://trip-owner.github.io');
  assert.equal(isAllowedFrontendOrigin('https://trip-owner.github.io'), true);
  verify({ name: 'Configured Pages origin passes cross-site check', hosted: true, host: 'trip.vercel.app', origin: 'https://trip-owner.github.io', headers: { 'Sec-Fetch-Site': 'cross-site' }, allow: true });
  verify({ name: 'Different GitHub account rejected', hosted: true, host: 'trip.vercel.app', origin: 'https://another-owner.github.io', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  verify({ name: 'Deceptive suffix rejected', hosted: true, host: 'trip.vercel.app', origin: 'https://trip-owner.github.io.evil.example', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  verify({ name: 'HTTP downgrade of Pages origin rejected', hosted: true, host: 'trip.vercel.app', origin: 'http://trip-owner.github.io', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  verify({ name: 'Repo pathname is not an origin', hosted: true, host: 'trip.vercel.app', origin: 'https://trip-owner.github.io/travel', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  verify({ name: 'Forged forwarded origin does not gain allowlist access', hosted: true, host: 'trip.vercel.app', origin: 'https://evil.example', headers: { 'Sec-Fetch-Site': 'cross-site', 'X-Forwarded-Host': 'trip-owner.github.io', 'Forwarded': 'host=trip-owner.github.io;proto=https' } });
  verify({ name: 'Existing Vercel same-origin still allowed with Pages configured', hosted: true, host: 'trip.vercel.app', origin: 'https://trip.vercel.app', allow: true });
  for (const configured of ['*', 'https://*.github.io', 'http://trip-owner.github.io', 'https://trip-owner.github.io/', 'https://trip-owner.github.io/travel', 'https://user@trip-owner.github.io', 'https://trip-owner.github.io?x=1', 'https://trip-owner.github.io#x', 'https://trip-owner.github.io,https://other.github.io', 'null']) {
    process.env.TRIP_FRONTEND_ORIGIN = configured;
    assert.equal(getAllowedFrontendOrigin(), null, `Invalid allowlist config must fail closed: ${configured}`);
    verify({ name: 'Malformed configuration cannot permit cross-site access', hosted: true, host: 'trip.vercel.app', origin: 'https://trip-owner.github.io', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  }
  console.log(`PASS origin regression: ${checked} request cases plus allowlist parsing; Next normalization, Vercel TLS, exact Pages allowlist and forged origins`);
} finally {
  if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  if (previousFrontendOrigin === undefined) delete process.env.TRIP_FRONTEND_ORIGIN; else process.env.TRIP_FRONTEND_ORIGIN = previousFrontendOrigin;
}
