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

// --- зона риска: тройки по номеру слота, а не по позиции в массиве ---

test('ритм: дыра в нумерации слотов — тройка считается по номеру слота', () => {
  // Воспроизведение из ревью: слоты 3..8 с дырой перед ними. Тройка слотов
  // {4,5,6} собирается целиком и содержит ДВА товарных поста — нарушение,
  // хотя по позиции в отсортированном массиве (элементы 1..3) это не видно.
  const feed = [
    goodPost({ id: 's3', slot: 3, exhibit: null }),
    goodPost({ id: 's4', slot: 4, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 's5', slot: 5, exhibit: null }),
    goodPost({ id: 's6', slot: 6, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 's7', slot: 7, exhibit: null }),
    goodPost({ id: 's8', slot: 8, exhibit: null }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false, 'тройка слотов {4,5,6} с двумя товарными должна считаться нарушением');
  const msg = r.problems.join(' ');
  assert.match(msg, /4/);
  assert.match(msg, /5/);
  assert.match(msg, /6/);
  assert.match(msg, /s4/);
  assert.match(msg, /s6/);
});

test('ритм: тот же случай в перемешанном порядке даёт тот же результат', () => {
  const feed = [
    goodPost({ id: 's6', slot: 6, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 's3', slot: 3, exhibit: null }),
    goodPost({ id: 's8', slot: 8, exhibit: null }),
    goodPost({ id: 's4', slot: 4, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 's7', slot: 7, exhibit: null }),
    goodPost({ id: 's5', slot: 5, exhibit: null }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false, 'порядок постов в ленте не должен влиять на результат');
});

test('ритм: неполная тройка (меньше трёх слотов) — не больше одного товарного', () => {
  // 5 постов, длина не кратна трём. Тройка слотов {1,2,3} полная и валидна.
  // Тройка слотов {4,5,6} неполная (нет поста в слоте 6), но содержит ДВА
  // товарных поста — это нарушение независимо от неполноты тройки.
  const feed = [
    goodPost({ id: 'a', slot: 1, exhibit: null }),
    goodPost({ id: 'b', slot: 2, exhibit: null }),
    goodPost({ id: 'c', slot: 3, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'd', slot: 4, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'e', slot: 5, exhibit: 'megalodon-tooth' }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false, 'два товарных в неполной тройке {4,5,6} — нарушение');
});

test('ритм: неполная тройка с нулём или одним товарным — не нарушение', () => {
  // Отсутствие постов само по себе не нарушает ритм.
  const feed = [
    goodPost({ id: 'a', slot: 1, exhibit: null }),
    goodPost({ id: 'b', slot: 2, exhibit: null }),
    goodPost({ id: 'c', slot: 3, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'd', slot: 4, exhibit: 'megalodon-tooth' }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('ритм: один пост в ленте — не нарушение', () => {
  const feed = [goodPost({ id: 'a', slot: 1, exhibit: 'megalodon-tooth' })];
  const r = checkRhythm(feed);
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('ритм: пустая лента — не нарушение', () => {
  const r = checkRhythm([]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('ритм: посты с негодным slot не участвуют в проверке', () => {
  // Полная валидная тройка {1,2,3} плюс «мусорный» пост без slot — он не
  // должен ни ломать сортировку (NaN), ни попадать в подсчёт троек.
  const feed = [
    goodPost({ id: 'a', slot: 1, exhibit: null }),
    goodPost({ id: 'b', slot: 2, exhibit: null }),
    goodPost({ id: 'c', slot: 3, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'junk', slot: undefined, exhibit: 'megalodon-tooth' }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, true, r.problems.join('; '));
});

// --- зона риска: битые элементы ленты не должны ронять валидатор ---

test('validatePost переживает post === null', () => {
  const r = validatePost(s, null);
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.problems) && r.problems.length > 0);
});

test('validateFeed переживает битый (null) элемент в массиве', () => {
  const feed = [goodPost({ id: 'a', slot: 1, exhibit: 'megalodon-tooth' }), null];
  const r = validateFeed(s, feed);
  assert.equal(r.ok, false);
  assert.ok(r.problems.length > 0 || r.posts.some((p) => !p.ok));
});
