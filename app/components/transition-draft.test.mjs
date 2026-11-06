import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDraftContent, rebaseDraft, recordTitle } from './record-draft.ts';
import { transitionVideoType } from './TransitionPlanner.tsx';

test('reference-only, video-only, and individual shooting notes can be saved without a title', () => {
  for (const field of ['referenceUrl', 'videoUrl', 'opening', 'ending', 'location', 'props', 'note']) {
    const data = { name: '', day: '', owner: '', openingDone: false, endingDone: false, [field]: 'A saved idea' };
    assert.equal(hasDraftContent(data, new Set()), true, field);
    assert.equal(recordTitle({ type: 'transition', data }), '待命名的转场');
  }
  assert.equal(hasDraftContent({ name: '', day: '', owner: '', openingDone: false, endingDone: false }, new Set()), false);
  assert.equal(hasDraftContent({ name: '', day: '', owner: '', openingDone: true, endingDone: false }, new Set()), true);
});

test('video selection accepts the exact size boundary and maps all supported containers', () => {
  assert.deepEqual(transitionVideoType({ name: '手机转场.MOV', size: 50 * 1024 * 1024 }), { extension: 'mov', contentType: 'video/quicktime' });
  assert.deepEqual(transitionVideoType({ name: 'clip.mp4', size: 1 }), { extension: 'mp4', contentType: 'video/mp4' });
  assert.deepEqual(transitionVideoType({ name: 'clip.webm', size: 1 }), { extension: 'webm', contentType: 'video/webm' });
  assert.throws(() => transitionVideoType({ name: 'clip.mp4', size: 50 * 1024 * 1024 + 1 }), /50 MB/);
  assert.throws(() => transitionVideoType({ name: 'clip.mp4', size: 0 }), /空文件/);
  assert.throws(() => transitionVideoType({ name: 'clip.mp4.exe', size: 1 }), /MP4/);
});

test('a completed upload survives a 409 without clearing a partner shooting notes or progress', () => {
  const baseline = { name: '', videoUrl: '', referenceUrl: '', opening: '', ending: '', openingDone: false, endingDone: false };
  const draft = { ...baseline, videoUrl: 'https://example.public.blob.vercel-storage.com/videos/clip.mp4' };
  const latest = { ...baseline, name: '海边转场', opening: '向右起跳', ending: '落地后转向海面', openingDone: true };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, videoUrl: draft.videoUrl });
});

test('editing the ending and completion preserves a partner replacement reference video', () => {
  const baseline = { videoUrl: 'https://example.com/old.mp4', ending: '', endingDone: false, openingDone: false };
  const draft = { ...baseline, ending: '落地后一起挥手', endingDone: true };
  const latest = { ...baseline, videoUrl: 'https://example.com/new.mp4', openingDone: true };
  assert.deepEqual(rebaseDraft(baseline, draft, latest), { ...latest, ending: draft.ending, endingDone: true });
});
