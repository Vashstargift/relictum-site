const test = require('node:test');
const assert = require('node:assert');
const { loadSources } = require('../lib/sources.js');
const {
  validatePost,
  checkRhythm,
  validateFeed,
  RUBRICS,
  SPEC_MAX_ROWS,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
} = require('../lib/feed-schema.js');

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

// --- зона риска: полнота тройки должна считаться по числу РАЗНЫХ слотов,
// а не по числу постов (дубль слота не должен превращать полную тройку в
// неполную и подменять строгое «ровно 1» на мягкое «не больше 1») ---

test('ритм: дубль слота в полной тройке без товарных — всё равно нарушение', () => {
  // Репро из повторного ревью: слот 1 задан дважды, слоты 2 и 3 — по разу.
  // Тройка {1,2,3} по различным слотам полная, товарных постов ноль —
  // нарушение «ровно 1», а не мягкое «не больше 1» (которое здесь бы не
  // сработало, т.к. 0 <= 1).
  const feed = [
    { id: 'a1', date: '2026-08-18', rubric: 'object', slot: 1, exhibit: null, format: 'carousel',
      frames: [{ type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' }],
      caption: { lead: 'x' }, tags: [], facts: [], status: 'ready', blockers: [] },
    { id: 'a2', date: '2026-08-18', rubric: 'object', slot: 1, exhibit: null, format: 'carousel',
      frames: [{ type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' }],
      caption: { lead: 'x' }, tags: [], facts: [], status: 'ready', blockers: [] },
    { id: 'b', date: '2026-08-18', rubric: 'object', slot: 2, exhibit: null, format: 'carousel',
      frames: [{ type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' }],
      caption: { lead: 'x' }, tags: [], facts: [], status: 'ready', blockers: [] },
    { id: 'c', date: '2026-08-18', rubric: 'object', slot: 3, exhibit: null, format: 'carousel',
      frames: [{ type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' }],
      caption: { lead: 'x' }, tags: [], facts: [], status: 'ready', blockers: [] },
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false, 'полная по числу различных слотов тройка {1,2,3} без товарных должна считаться нарушением');
});

test('ритм: дубль слота в полной тройке с двумя товарными — тоже нарушение', () => {
  // Тот же дубль слота 1, но теперь товарных два (a1 и c) — нарушение
  // «ровно 1» должно ловиться независимо от того, как считать полноту.
  const feed = [
    goodPost({ id: 'a1', slot: 1, exhibit: 'megalodon-tooth' }),
    goodPost({ id: 'a2', slot: 1, exhibit: null }),
    goodPost({ id: 'b', slot: 2, exhibit: null }),
    goodPost({ id: 'c', slot: 3, exhibit: 'megalodon-tooth' }),
  ];
  const r = checkRhythm(feed);
  assert.equal(r.ok, false, 'два товарных в тройке — нарушение независимо от дубля слота');
});

// --- зона риска: сообщение о полностью отсутствующем посте не должно
// звучать так, будто пост есть, но у него не хватает поля id ---

test('validatePost(null): сообщение говорит, что поста нет вовсе, а не что у него нет id', () => {
  const r = validatePost(s, null);
  const msg = r.problems.join(' ');
  // Старый текст «нет поля id» вводил в заблуждение — как будто пост есть,
  // просто без одного поля. Проверяем, что формулировка не повторяет этот
  // текст и явно указывает на отсутствие самого поста.
  assert.doesNotMatch(msg, /нет поля id/, 'сообщение не должно звучать как «пост есть, но без поля id»');
  assert.match(msg, /нет|отсутств/i);
});

// --- пределы данных карточки: ограничить данные на входе вместо того,
// чтобы рендерер молча ужимал шрифт — лента должна говорить автору
// «сократи», а не подгонять контент под кадр ---

function specRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) rows.push([`Метка ${i + 1}`, `Значение ${i + 1}`]);
  return rows;
}

test('паспорт: шесть строк в data.rows (больше предела) отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: { name: 'Экспонат', rows: specRows(SPEC_MAX_ROWS + 1) } }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /паспорте больше 5 строк/);
});

test('паспорт: пять строк в data.rows (ровно предел) проходит', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: { name: 'Экспонат', rows: specRows(SPEC_MAX_ROWS) } }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('паспорт: строка не из двух непустых строк отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: { name: 'Экспонат', rows: [['Только метка']] } }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /парой из двух непустых строк/);
});

test('паспорт: строка с пустым вторым элементом тоже отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: { name: 'Экспонат', rows: [['Метка', '   ']] } }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /парой из двух непустых строк/);
});

test('текст в data длиннее предела (221 знак) отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'end', data: { line: 'а'.repeat(MAX_TEXT_LENGTH + 1) } }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), new RegExp(`длиннее ${MAX_TEXT_LENGTH} знаков`));
});

test('текст в data ровно предела (220 знаков) проходит', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'end', data: { line: 'а'.repeat(MAX_TEXT_LENGTH) } }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('заголовок карточки длиннее предела (61 знак) отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'cover', data: { title: 'а'.repeat(MAX_TITLE_LENGTH + 1) } }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), new RegExp(`заголовок карточки .* длиннее ${MAX_TITLE_LENGTH} знаков`));
});

test('заголовок карточки ровно предела (60 знаков) проходит', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'cover', data: { title: 'а'.repeat(MAX_TITLE_LENGTH), kicker: 'x', sub: 'x' } }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

// --- карточка рубрики era: датировка обязана подтверждаться фактом поста ---

function eraPost(over = {}) {
  return goodPost(Object.assign({
    rubric: 'era',
    exhibit: null,
    frames: [
      { type: 'card', tpl: 'era', data: { era: 'Меловой период', when: '145 — 66 млн лет назад', fact: 'Проверочный факт.' } },
      { type: 'card', tpl: 'end', data: {} },
    ],
    facts: [],
  }, over));
}

test('пост с карточкой era без подтверждающего факта отклоняется', () => {
  const r = validatePost(s, eraPost());
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

test('пост с карточкой era с подтверждающим фактом (eras.js) проходит', () => {
  const r = validatePost(s, eraPost({
    facts: [{ claim: 'датировка периода', value: '145 — 66 млн лет назад', source: 'eras.js:cretaceous.when', checked: true }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('пост с карточкой era: факт с другим значением датировки не подтверждает карточку', () => {
  const r = validatePost(s, eraPost({
    facts: [{ claim: 'датировка периода', value: '145 — 65 млн лет назад', source: 'eras.js:cretaceous.when', checked: true }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

test('пост с карточкой era: факт с нерезолвящимся источником не подтверждает карточку', () => {
  const r = validatePost(s, eraPost({
    facts: [{ claim: 'датировка периода', value: '145 — 66 млн лет назад', source: 'eras.js:нет-такой-эпохи.when', checked: true }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

// --- реальная лента месяца (Задача 6) ---

test('реальная лента feed-data.js проходит валидацию', () => {
  const prev = global.window;
  global.window = {};
  try {
    delete require.cache[require.resolve('../feed-data.js')];
    require('../feed-data.js');
    const feed = global.window.RELICTUM_FEED;
    assert.ok(Array.isArray(feed), 'feed-data.js должен отдать RELICTUM_FEED');
    assert.equal(feed.length, 15, `ожидали 15 постов, получили ${feed.length}`);
    const r = validateFeed(s, feed);
    const all = r.problems.concat(...r.posts.map((p) => p.problems));
    assert.equal(r.ok, true, all.join('\n'));
  } finally {
    global.window = prev;
  }
});
