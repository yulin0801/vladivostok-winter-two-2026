// Offline integration test: real libSQL SQLite, no network or cloud credentials.
// Run after dependency installation: node app/lib/database.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createClient } from '@libsql/client';
import ts from 'typescript';

const source = await fs.readFile(new URL('./database.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace('from "@libsql/client"', `from ${JSON.stringify(import.meta.resolve('@libsql/client'))}`);
const { TripDatabase } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const client = createClient({ url: 'file::memory:', intMode: 'number' });
const db = new TripDatabase(client);

try {
  const migration = await fs.readFile(new URL('../../drizzle/0000_magenta_ken_ellis.sql', import.meta.url), 'utf8');
  await db.batch(migration.split('--> statement-breakpoint').map(sql => db.prepare(sql.trim())).filter(statement => statement.sql));
  for (let i = 0; i < 3; i++) {
    const inserted = await db.prepare('INSERT INTO trip_records VALUES (?, ?, ?, 1, ?, ?, 0)').bind(`test-${i}`, 'place', JSON.stringify({ name: `Test ${i}`, day: '2026-12-06', order: i }), 'test', 'now').run();
    assert.equal(inserted.meta.changes, 1);
  }
  assert.equal(await db.prepare('SELECT * FROM trip_records WHERE id=?').bind('missing').first(), null);
  const rows = (await db.prepare('SELECT * FROM trip_records ORDER BY id').all()).results;
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), ['id', 'type', 'payload', 'version', 'updated_by', 'updated_at', 'deleted']);

  const update = await db.prepare('UPDATE trip_records SET version=version+1 WHERE id=? AND version=? RETURNING *').bind('test-0', 1).first();
  assert.equal(update.version, 2);
  assert.equal(await db.prepare('UPDATE trip_records SET version=version+1 WHERE id=? AND version=? RETURNING *').bind('test-0', 1).first(), null);
  console.log('PASS libSQL adapter: plain reads, affected rows, missing rows, atomic version conflict');

  await assert.rejects(db.batch([
    db.prepare('INSERT INTO trip_records VALUES (?, ?, ?, 1, ?, ?, 0)').bind('must-rollback', 'note', '{}', 'test', 'now'),
    db.prepare('INSERT INTO trip_records VALUES (?, ?, ?, 1, ?, ?, 0)').bind('test-0', 'note', '{}', 'test', 'now'),
  ]));
  assert.equal(await db.prepare('SELECT * FROM trip_records WHERE id=?').bind('must-rollback').first(), null);
  console.log('PASS libSQL batch: complete rollback on failure');

  const route = await fs.readFile(new URL('../api/reorder/route.ts', import.meta.url), 'utf8');
  const reorderSql = route.match(/const sql = `([\s\S]+?)`;/)[1].replace('${values}', '(?, ?, ?), (?, ?, ?), (?, ?, ?)');
  const applied = await db.prepare(reorderSql).bind('test-0', 2, 2, 'test-1', 1, 1, 'test-2', 1, 0, 'test', 'later', 3).all();
  assert.equal(applied.results.length, 3);
  const before = (await db.prepare('SELECT * FROM trip_records ORDER BY id').all()).results;
  const stale = await db.prepare(reorderSql).bind('test-0', 2, 0, 'test-1', 2, 1, 'test-2', 2, 2, 'test', 'later', 3).all();
  assert.equal(stale.results.length, 0);
  assert.deepEqual((await db.prepare('SELECT * FROM trip_records ORDER BY id').all()).results, before);
  console.log('PASS libSQL JSON + MATERIALIZED CTE: reorder success, stale reorder changes nothing');

  const reservation = "INSERT INTO service_limits (name, next_allowed) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET next_allowed = MAX(service_limits.next_allowed, ?) + 1200 WHERE service_limits.next_allowed < ? RETURNING next_allowed";
  const slotA = await db.prepare(reservation).bind('map', 2200, 1000, 13000).first();
  const slotB = await db.prepare(reservation).bind('map', 2200, 1000, 13000).first();
  assert.equal(slotA.next_allowed, 2200);
  assert.equal(slotB.next_allowed, 3400);
  console.log('PASS libSQL shared rate reservation: serialized 1200 ms slots');
} finally {
  client.close();
}
