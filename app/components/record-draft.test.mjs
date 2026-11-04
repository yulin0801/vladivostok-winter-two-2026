import assert from 'node:assert/strict';
import test from 'node:test';
import { rebaseDraft } from './record-draft.ts';

test('a note on a photo-only hotel does not clear fields a partner filled during a 409 conflict', () => {
  // The stored record had no title, price or coordinates. The form showed blanks.
  const baseline = { name: '', price: '', lat: '', lng: '', note: '', images: ['/api/files/a'] };
  const draft = { ...baseline, note: 'A quiet room, please' };
  const latest = { ...baseline, name: 'Harbour Hotel', price: 6000, lat: 43.11, lng: 131.88 };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, note: draft.note });
  assert.equal(draft.name, ''); // Rebasing never mutates the local snapshot.
});

test('an image upload is preserved without requiring a touched-field marker', () => {
  const baseline = { name: '', note: '', images: ['/api/files/a'] };
  const draft = { ...baseline, images: [...baseline.images, '/api/files/b'] };
  const latest = { ...baseline, name: 'Hotel named by partner', note: 'Breakfast included' };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, images: draft.images });
});

test('a selected search result changes name and coordinates while preserving a partner price', () => {
  const baseline = { name: '', lat: '', lng: '', price: '', note: '' };
  const draft = { ...baseline, name: 'Cafe', lat: 43.12, lng: 131.89 };
  const latest = { ...baseline, price: 850, note: 'Opens at 10' };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, name: 'Cafe', lat: 43.12, lng: 131.89 });
});

test('an explicit user clear is retained, while untouched fields use the newest values', () => {
  const baseline = { name: 'Old name', note: 'Old note', price: 100 };
  const draft = { ...baseline, name: '' };
  const latest = { name: 'Partner name', note: 'Updated note', price: 200 };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, name: '' });
});

test('a second 409 uses the refreshed baseline and keeps newer partner additions', () => {
  const originalBaseline = { name: '', note: '', price: '' };
  const originalDraft = { ...originalBaseline, note: 'My note' };
  const firstLatest = { ...originalBaseline, name: 'Partner name' };
  const firstDraft = rebaseDraft(originalBaseline, originalDraft, firstLatest);
  const secondLatest = { ...firstLatest, name: 'Refined partner name', price: 4500 };
  assert.deepEqual(rebaseDraft(firstLatest, firstDraft, secondLatest), { ...secondLatest, note: 'My note' });
});

test('a defaulted order captured at editor open is not treated as a later user change', () => {
  const baseline = { name: '', order: 1000, day: '', note: '' };
  const draft = { ...baseline, note: 'Check opening hours' };
  const latest = { ...baseline, name: 'Museum', order: 2, day: '2026-12-06' };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, note: draft.note });
});
