// Run: node --import tsx app/lib/validation.test.mjs
import assert from 'node:assert/strict';
import { validateData, validCoordinate } from './server.ts';

let assertions = 0;
const accept = (type, data, label) => {
  const before = structuredClone(data);
  assert.doesNotThrow(() => validateData(data, type), label);
  assert.deepEqual(data, before, 'Validation must not synthesize missing fields');
  assertions++;
};
const reject = (type, data, label) => {
  assert.throws(() => validateData(data, type), error => error.status === 400 || error.status === 413, label);
  assertions++;
};

for (const type of ['place', 'note', 'packing', 'restaurant', 'hotel', 'gift', 'settings', 'transition']) {
  accept(type, { note: '先记下一点，其他稍后补充' }, `${type}: description-only record`);
  reject(type, {}, `${type}: empty object`);
  reject(type, { name: '   ', text: '', images: [], order: Date.now(), done: false }, `${type}: whitespace and internal defaults only`);
}
accept('place', { name: '一个待定位的地方' }, 'Name without coordinates');
accept('place', { lat: 43.12 }, 'Latitude without name or longitude');
accept('place', { lng: 131.89 }, 'Longitude without name or latitude');
accept('place', { note: '稍后定位', lat: '', lng: null }, 'Blank coordinates stay blank');
accept('restaurant', { price: 0 }, 'Explicit zero price remains valid');
accept('hotel', { images: ['/api/files/8bfe4c50-8254-4cc1-a1db-123456789abc'] }, 'Photo-only hotel');
accept('hotel', { url: 'https://example.com/hotel' }, 'Link-only hotel');
accept('hotel', { price: 4200 }, 'Price-only hotel');
accept('gift', { quantity: 2 }, 'Quantity-only gift');
accept('packing', { text: '备用电池' }, 'Packing item without selected owner');
accept('note', { category: '交通' }, 'Explicit category-only note');
accept('settings', { outbound: '13:00–18:05' }, 'Only outbound flight filled');
accept('hotel', { note: '先收集', price: '', nights: null, url: '   ' }, 'Other optional fields blank');

const photo = '/api/files/8bfe4c50-8254-4cc1-a1db-123456789abc';
for (const type of ['restaurant', 'hotel', 'gift']) {
  accept(type, { images: [photo] }, `${type}: photos without any text or price`);
  accept(type, { images: Array(8).fill(photo) }, `${type}: eight photos allowed`);
  accept(type, { photos: Array(8).fill(photo) }, `${type}: legacy photos field follows the same limit`);
  reject(type, { images: Array(9).fill(photo) }, `${type}: ninth photo rejected`);
  reject(type, { photos: Array(9).fill(photo) }, `${type}: legacy photos field cannot bypass limit`);
  reject(type, { images: Array(8).fill(photo), photos: [photo] }, `${type}: combined photo count is bounded`);
  reject(type, { images: ['javascript:alert(1)'] }, `${type}: unsafe image-only content rejected`);
  reject(type, { images: [{}] }, `${type}: image list contains only URLs`);
}

const videoUrl = 'https://offlinestore.public.blob.vercel-storage.com/videos/8bfe4c50-8254-4cc1-a1db-123456789abc.mp4';
accept('transition', { videoUrl }, 'Uploaded video alone is meaningful');
accept('transition', { referenceUrl: 'https://example.com/reference' }, 'Reference link alone is meaningful');
accept('transition', { openingDone: true }, 'An explicitly completed filming step is meaningful');
accept('transition', { ending: '转身看向大海', openingDone: false, endingDone: true }, 'Independent filming progress flags');
for (const key of ['name', 'opening', 'ending', 'location', 'owner', 'props', 'note']) {
  accept('transition', { [key]: '稍后补充其他内容' }, `Transition ${key} can be the only filled field`);
  reject('transition', { [key]: {} }, `Transition ${key} must be text`);
}
accept('transition', { day: '2026-12-08' }, 'Transition date can be the only filled field');
reject('transition', { videoUrl: 'https://example.com/video.mp4' }, 'Playback URL must be an uploaded Blob video');
reject('transition', { videoUrl: videoUrl.replace('.com/', '.com.evil.example/') }, 'Deceptive Blob hostname');
reject('transition', { videoUrl: videoUrl.replace('/videos/', '/images/') }, 'Non-video storage path');
reject('transition', { videoUrl: `${videoUrl}?alternate=1` }, 'Unexpected URL suffix');
reject('transition', { videoUrl: 'javascript:alert(1)' }, 'Unsafe video scheme');
reject('transition', { referenceUrl: 'javascript:alert(1)' }, 'Unsafe reference scheme');
reject('transition', { referenceUrl: photo }, 'Reference link must be an external HTTP(S) URL');
reject('transition', { openingDone: 'true' }, 'Opening status must be boolean');
reject('transition', { endingDone: 1 }, 'Ending status must be boolean');
reject('transition', { openingDone: false, endingDone: false }, 'Untouched progress alone is empty');

reject('hotel', { price: -1 }, 'Negative price');
reject('hotel', { price: '4200' }, 'Numeric string is not silently coerced');
reject('hotel', { price: NaN }, 'NaN price');
reject('hotel', { nights: 0 }, 'Zero nights');
reject('gift', { quantity: 1.2 }, 'Fractional quantity');
reject('place', { lat: 0 }, 'Invalid partial latitude');
reject('place', { lng: Infinity }, 'Non-finite partial longitude');
reject('place', { lat: '43.1' }, 'Coordinates must be numeric when supplied');
reject('hotel', { url: 'javascript:alert(1)' }, 'Unsafe scheme');
reject('hotel', { images: ['data:text/html,<script>bad</script>'] }, 'Unsafe image scheme');
reject('hotel', { images: 'https://example.com/image.png' }, 'Image list must be an array');
reject('place', { name: { text: 'object' } }, 'Text fields cannot contain objects');
reject('packing', { text: '雨伞', owner: 'unknown-person' }, 'Invalid supplied owner');
reject('place', { day: '2026-12-11' }, 'Invalid supplied trip date');
reject('place', { time: '25:90' }, 'Invalid supplied time');
assert.equal(validCoordinate(43.12, undefined), false, 'Partial coordinates must not become a map location');
assert.equal(validCoordinate(undefined, 131.89), false, 'Partial coordinates must not become a map location');
assert.equal(validCoordinate(43.12, 131.89), true);
console.log(`PASS optional fields: ${assertions} acceptance/rejection cases; no synthesized values and incomplete coordinates remain unplottable`);
