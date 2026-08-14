const test = require('node:test');
const assert = require('node:assert');
const { loadSources } = require('../lib/sources.js');
const { validatePost, checkRhythm, validateFeed, RUBRICS } = require('../lib/feed-schema.js');

const s = loadSources();

function goodPost(over = {}) {
  return Object.assign({
    id: 'p01',
    date: '2026-08-18',
    rubric: 'object',
    slot: 1,
    exhibit: 'megalodon-tooth',
    format: 'carousel',
    frames: [
      { type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' },
      { type: 'card', tpl: 'end', data: {} },
    ],
    caption: { lead: 'Зуб мегалодона', body: 'Текст.', cta: 'По запросу в галерею.' },
    tags: ['#relictum'],
    facts: [],
    status: 'ready',
    blockers: [],
  }, over);
}

test('корректный пост проходит', () => {
  const r = validatePost(s, goodPost());
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('неизвестная рубрика отклоняется', () => {
  const r = validatePost(s, goodPost({ rubric: 'мемы' }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /рубрика/);
});

test('семь рубрик, среди них era', () => {
  assert.equal(RUBRICS.length, 7);
  assert.ok(RUBRICS.includes('era'));
});

test('несуществующий файл ассета отклоняется', () => {
  const r = validatePost(s, goodPost({ frames: [{ type: 'video', src: 'нет_такого.mp4', crop: '4:5' }] }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не найден/);
});

test('несуществующий экспонат отклоняется', () => {
  const r = validatePost(s, goodPost({ exhibit: 'нет-такого' }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /экспонат/);
});

test('exhibit=null допустим для воздушного поста', () => {
  const r = validatePost(s, goodPost({ exhibit: null, rubric: 'era' }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('плохая дата отклоняется', () => {
  const r = validatePost(s, goodPost({ date: '18.08.2026' }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /дата/);
});

test('ритм 2+1: ровно один товарный на тройку', () => {
  const feed = [
    goodPost({ id: 'a', slot: 1, exhibit: null }),
    goodPost({ id: 'b', slot: 2, exhibit: null }),
    goodPost({ id: 'c', slot: 3, exhibit: 'megalodon-tooth' }),
  ];
  assert.equal(checkRhythm(feed).ok, true);
});

test('ритм нарушен: два товарных в тройке', () => {
  const feed = [
    goodPost({ id: 'a', slot: 1, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'b', slot: 2, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'c', slot: 3, exhibit: null }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /ритм/);
});

test('дублирующийся slot отклоняется', () => {
  const feed = [goodPost({ id: 'a', slot: 1 }), goodPost({ id: 'b', slot: 1 })];
  const r = validateFeed(s, feed);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /slot/);
});
