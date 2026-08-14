const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadSources } = require('../lib/sources.js');
const { loadFeed, outDirFor, buildPost } = require('../build_feed.js');

test('loadFeed отдаёт 15 постов', () => {
  assert.equal(loadFeed().length, 15);
});

test('outDirFor складывает дату, рубрику и экспонат', () => {
  const d = outDirFor({ date: '2026-08-22', rubric: 'object', exhibit: 'megalodon-tooth' });
  assert.match(d, /2026-08-22_object_megalodon-tooth$/);
});

test('outDirFor без экспоната берёт id поста', () => {
  const d = outDirFor({ date: '2026-08-18', rubric: 'era', exhibit: null, id: 'p01' });
  assert.match(d, /2026-08-18_era_p01$/);
});

test('buildPost собирает кадры по порядку и подпись', async () => {
  const s = loadSources();
  const post = loadFeed().find((p) => p.id === 'p03');
  const r = await buildPost(s, post);
  assert.ok(fs.existsSync(path.join(r.dir, 'caption.txt')));
  assert.ok(fs.existsSync(path.join(r.dir, 'meta.json')));
  assert.equal(r.files.length, post.frames.length);
  assert.match(r.files[0], /^01\./);
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  assert.equal(meta.id, 'p03');
});
