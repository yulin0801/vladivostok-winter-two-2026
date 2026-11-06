// Actual Blob SDK token/signature integration + SQLite; no network or cloud data.
// Run: node --import tsx app/lib/video-upload.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { proxy } from '../../proxy.ts';
import { POST as videoUpload } from '../api/video-upload/route.ts';
import { POST as createRecord } from '../api/records/route.ts';
import { PUT as updateRecord } from '../api/records/[id]/route.ts';
import { database } from './server.ts';
import { MAX_VIDEO_BYTES } from './video.ts';

const frontend = 'https://trip-owner.github.io';
const api = 'https://trip-api.vercel.app';
const path = 'videos/8bfe4c50-8254-4cc1-a1db-123456789abc';
// This intentionally fake token is used only for local SDK cryptography.
const fakeToken = 'vercel_blob_rw_offlinestore_offline-test-not-a-cloud-credential';
const env = {
  NODE_ENV: 'test', TURSO_DATABASE_URL: 'file::memory:', TURSO_AUTH_TOKEN: undefined,
  BLOB_READ_WRITE_TOKEN: fakeToken, BLOB_STORE_ID: 'offline-store', TRIP_FRONTEND_ORIGIN: frontend,
  VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'trip-api.vercel.app',
  VERCEL_BLOB_CALLBACK_URL: undefined,
};
const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let tokenCases = 0;

function request(endpoint, body, { origin = frontend, headers = {}, method = 'POST' } = {}) {
  return new NextRequest(`${api}${endpoint}`, {
    method,
    headers: { host: 'trip-api.vercel.app', 'content-type': 'application/json', ...(origin ? { origin, 'sec-fetch-site': 'cross-site' } : {}), 'x-trip-editor': encodeURIComponent('张渝琳'), ...headers },
    body: JSON.stringify(body),
  });
}
function event(pathname = `${path}.mp4`, extra = {}) {
  return { type: 'blob.generate-client-token', payload: { pathname, multipart: true, ...extra } };
}
async function rejected(body, status, options) {
  const response = await videoUpload(request('/api/video-upload', body, options));
  assert.equal(response.status, status);
  assert.equal(typeof (await response.json()).error, 'string');
  tokenCases++;
}

try {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  globalThis.fetch = async () => { throw new Error('Network access is forbidden in this test'); };
  const db = database();
  const migration = await fs.readFile(new URL('../../drizzle/0000_magenta_ken_ellis.sql', import.meta.url), 'utf8');
  await db.batch(migration.split('--> statement-breakpoint').map(sql => db.prepare(sql.trim())).filter(statement => statement.sql));

  const preflight = new NextRequest(`${api}/api/video-upload`, { method: 'OPTIONS', headers: { origin: frontend, 'access-control-request-method': 'POST', 'access-control-request-headers': 'Content-Type, X-Trip-Editor' } });
  assert.equal(proxy(preflight).status, 204);
  for (const [extension, contentType] of [['mp4', 'video/mp4'], ['mov', 'video/quicktime'], ['webm', 'video/webm']]) {
    const req = request('/api/video-upload', event(`${path}.${extension}`, {
      clientPayload: 'untrusted metadata', maximumSizeInBytes: 999999999,
      allowedContentTypes: ['text/html'], allowOverwrite: true,
    }));
    assert.equal(proxy(req).headers.get('access-control-allow-origin'), frontend);
    const before = Date.now();
    const response = await videoUpload(req);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.type, 'blob.generate-client-token');
    const constraints = getPayloadFromClientToken(result.clientToken);
    assert.equal(constraints.pathname, `${path}.${extension}`);
    assert.deepEqual(constraints.allowedContentTypes, [contentType]);
    assert.equal(constraints.maximumSizeInBytes, 50 * 1024 * 1024);
    assert.equal(constraints.maximumSizeInBytes, MAX_VIDEO_BYTES);
    assert.equal(constraints.allowOverwrite, false);
    assert.equal(constraints.addRandomSuffix, false);
    assert.ok(constraints.validUntil >= before + 3599000 && constraints.validUntil <= Date.now() + 3600000);
    assert.equal(constraints.onUploadCompleted.callbackUrl, `${api}/api/video-upload`);
    assert.deepEqual(JSON.parse(constraints.onUploadCompleted.tokenPayload), { kind: 'transition-video', pathname: `${path}.${extension}`, editor: '张渝琳' });
    tokenCases++;
  }
  for (const pathname of ['video.mp4', 'images/file.mp4', 'videos/../image.mp4', `${path}.html`, `${path}.mp4/extra`, `${path}.mp4?overwrite=1`, `${path.replace('-4cc1-', '-1cc1-')}.mp4`, 'videos/*']) {
    await rejected(event(pathname), 400);
  }
  await rejected(event(), 403, { origin: 'https://other-owner.github.io' });
  await rejected(event(), 403, { origin: null });
  await rejected(event(undefined, { multipart: 'yes' }), 400);
  await rejected(event(undefined, { clientPayload: {} }), 400);
  await rejected(event(undefined, { clientPayload: 'x'.repeat(9000) }), 413);
  await rejected({ type: 'unexpected', payload: {} }, 400);
  await rejected({ type: 'blob.generate-client-token', payload: null }, 400);

  const callback = { type: 'blob.upload-completed', payload: {
    blob: { pathname: `${path}.mp4`, url: `https://offlinestore.public.blob.vercel-storage.com/${path}.mp4`, contentType: 'video/mp4', contentDisposition: 'inline', downloadUrl: 'https://example.test/download', etag: 'offline' },
    tokenPayload: JSON.stringify({ kind: 'transition-video', pathname: `${path}.mp4`, editor: '张渝琳' }),
  } };
  const signature = createHmac('sha256', fakeToken).update(JSON.stringify(callback)).digest('hex');
  await rejected(callback, 401, { origin: null });
  await rejected(callback, 401, { origin: null, headers: { 'x-vercel-signature': 'x' } });
  await rejected(callback, 401, { origin: null, headers: { 'x-vercel-signature': '0'.repeat(64) } });
  const altered = structuredClone(callback);
  altered.payload.blob.pathname = `${path}.webm`;
  await rejected(altered, 401, { origin: null, headers: { 'x-vercel-signature': signature } });
  // Vercel's signed callback is accepted without Origin; retries remain inert.
  for (let i = 0; i < 2; i++) {
    const response = await videoUpload(request('/api/video-upload', callback, { origin: null, headers: { 'x-vercel-signature': signature } }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: 'blob.upload-completed', response: 'ok' });
    tokenCases++;
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM trip_records').first()).total, 0, 'Upload callbacks never create trip records');

  for (const data of [{ videoUrl: callback.payload.blob.url }, { referenceUrl: 'https://example.test/reference' }, { opening: '用围巾遮住镜头' }]) {
    const created = await createRecord(request('/api/records', { type: 'transition', data }));
    assert.equal(created.status, 201);
    const { record } = await created.json();
    assert.deepEqual(record.data, data, 'Partial entries stay partial');
    const context = { params: Promise.resolve({ id: record.id }) };
    const endpoint = `/api/records/${record.id}`;
    const updated = await updateRecord(request(endpoint, { version: 1, data: { ...data, endingDone: true } }, { method: 'PUT' }), context);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).record.version, 2);
    const before = await db.prepare('SELECT * FROM trip_records WHERE id = ?').bind(record.id).first();
    const stale = await updateRecord(request(endpoint, { version: 1, data: { note: 'stale edit' } }, { method: 'PUT' }), context);
    assert.equal(stale.status, 409);
    const unsafe = await updateRecord(request(endpoint, { version: 2, data: { videoUrl: 'javascript:alert(1)' } }, { method: 'PUT' }), context);
    assert.equal(unsafe.status, 400);
    assert.deepEqual(await db.prepare('SELECT * FROM trip_records WHERE id = ?').bind(record.id).first(), before, 'Rejected updates preserve content and version');
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM trip_records').first()).total, 3);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  await rejected(event(), 503);
  console.log(`PASS video upload: ${tokenCases} real-SDK token/callback cases, Pages CORS, 50 MiB exact-path/MIME/no-overwrite constraints, valid signed no-Origin callbacks, tampering rejected; three partial transition CRUD flows with CAS; no network or cloud writes`);
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
