// Offline API integration: actual handlers + SQLite, memory Blob substitute.
// No cloud database, Blob, or existing trip data is touched.
// Run: node --import tsx app/lib/images.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy.ts';
import { database } from './server.ts';
import { tripImageStore } from './blob-store.ts';
import { POST as upload } from '../api/upload/route.ts';
import { GET as readImage } from '../api/files/[id]/route.ts';
import { POST as createRecord } from '../api/records/route.ts';
import { PUT as updateRecord } from '../api/records/[id]/route.ts';

const frontend = 'https://trip-owner.github.io';
const api = 'https://trip-api.vercel.app';
const envKeys = ['NODE_ENV', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BLOB_STORE_ID', 'TRIP_FRONTEND_ORIGIN', 'VERCEL'];
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalPut = tripImageStore.put;
const originalGet = tripImageStore.get;
const originalFetch = globalThis.fetch;
const files = new Map();
let writes = 0;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=', 'base64');

function request(path, method, body, origin = frontend) {
  const headers = { origin, host: 'trip-api.vercel.app', 'sec-fetch-site': 'cross-site', 'x-trip-editor': encodeURIComponent('崔天琴') };
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  return new NextRequest(`${api}${path}`, { method, headers, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
}
function form(bytes, type = 'image/png') {
  const value = new FormData();
  value.set('file', new File([bytes], 'photo.png', { type }));
  return value;
}
function corsPasses(req) {
  const response = proxy(req);
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('access-control-allow-origin'), frontend);
  assert.equal(response.headers.get('vary'), 'Origin');
}

try {
  Object.assign(process.env, { NODE_ENV: 'test', TURSO_DATABASE_URL: 'file::memory:', BLOB_STORE_ID: 'offline-test-only', TRIP_FRONTEND_ORIGIN: frontend, VERCEL: '1' });
  delete process.env.TURSO_AUTH_TOKEN;
  globalThis.fetch = async () => { throw new Error('Network access is forbidden in this test'); };
  tripImageStore.put = async (id, bytes, options) => {
    writes++;
    files.set(id, { bytes: new Uint8Array(bytes), contentType: options.httpMetadata.contentType });
  };
  tripImageStore.get = async id => {
    const file = files.get(id);
    return file ? { body: file.bytes, httpMetadata: { contentType: file.contentType }, httpEtag: 'offline-image' } : null;
  };
  const db = database();
  const migration = await fs.readFile(new URL('../../drizzle/0000_magenta_ken_ellis.sql', import.meta.url), 'utf8');
  await db.batch(migration.split('--> statement-breakpoint').map(sql => db.prepare(sql.trim())).filter(statement => statement.sql));

  for (const [path, method, headers] of [['/api/upload', 'POST', 'x-trip-editor'], ['/api/files/00000000-0000-0000-0000-000000000000', 'GET', 'x-trip-editor']]) {
    const preflight = new NextRequest(`${api}${path}`, { method: 'OPTIONS', headers: { origin: frontend, 'access-control-request-method': method, 'access-control-request-headers': headers } });
    assert.equal(proxy(preflight).status, 204, `${path}: Pages preflight accepted`);
  }

  const uploadRequest = request('/api/upload', 'POST', form(png));
  corsPasses(uploadRequest);
  const uploaded = await upload(uploadRequest);
  assert.equal(uploaded.status, 201);
  const { url } = await uploaded.json();
  assert.match(url, /^\/api\/files\/[a-f0-9-]{36}$/);
  const id = url.split('/').at(-1);
  const imageRequest = request(url, 'GET');
  corsPasses(imageRequest);
  const image = await readImage(imageRequest, { params: Promise.resolve({ id }) });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png, 'Large-view source preserves original bytes');
  assert.equal(writes, 1);

  for (const type of ['restaurant', 'hotel', 'gift']) {
    const created = await createRecord(request('/api/records', 'POST', { type, data: { images: [url] } }));
    assert.equal(created.status, 201, `${type}: image-only creation succeeds`);
    const { record } = await created.json();
    assert.deepEqual(record.data, { images: [url] }, 'No name, price, or coordinates synthesized');
    const context = { params: Promise.resolve({ id: record.id }) };
    const path = `/api/records/${record.id}`;
    const saved = await updateRecord(request(path, 'PUT', { version: 1, data: { images: Array(8).fill(url) } }), context);
    assert.equal(saved.status, 200, `${type}: eight-photo update succeeds`);
    assert.equal((await saved.json()).record.version, 2);
    const before = await db.prepare('SELECT * FROM trip_records WHERE id = ?').bind(record.id).first();
    const rejected = await updateRecord(request(path, 'PUT', { version: 2, data: { images: Array(9).fill(url) } }), context);
    assert.equal(rejected.status, 400, `${type}: ninth photo rejected on update`);
    assert.match((await rejected.json()).error, /8/);
    assert.deepEqual(await db.prepare('SELECT * FROM trip_records WHERE id = ?').bind(record.id).first(), before, 'Rejected photo update preserves saved content and version');
    const rejectedCreate = await createRecord(request('/api/records', 'POST', { type, data: { images: Array(9).fill(url) } }));
    assert.equal(rejectedCreate.status, 400, `${type}: ninth photo rejected on creation`);
  }
  assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM trip_records').first()).total, 3);

  const disguisedSvg = await upload(request('/api/upload', 'POST', form('<svg xmlns="http://www.w3.org/2000/svg"></svg>')));
  assert.equal(disguisedSvg.status, 415, 'Claimed PNG MIME cannot bypass magic-byte validation');
  const tooLarge = await upload(request('/api/upload', 'POST', form(new Uint8Array(4 * 1024 * 1024 + 1))));
  assert.equal(tooLarge.status, 413, '4 MB upload cap remains in effect');
  const wrongOrigin = await upload(request('/api/upload', 'POST', form(png), 'https://other-owner.github.io'));
  assert.equal(wrongOrigin.status, 403, 'Unconfigured frontend cannot upload');
  assert.equal(writes, 1, 'Rejected uploads never reach Blob');
  console.log('PASS images: Pages upload/read preflight and CORS, original PNG round-trip, all three image-only record types, 8-photo create/update limit with unchanged rejected records, 4 MB/MIME/origin rejection; no network or cloud writes');
} finally {
  tripImageStore.put = originalPut;
  tripImageStore.get = originalGet;
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
