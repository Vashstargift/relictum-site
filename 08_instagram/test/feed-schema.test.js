const test = require('node:test');
const assert = require('node:assert');
const { loadSources } = require('../lib/sources.js');
const {
  validatePost,
  checkRhythm,
  checkGridLayout,
  validateFeed,
  postAspect,
  RUBRICS,
  SPEC_MAX_ROWS,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_BIG_LENGTH,
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

// --- раскладка сетки: ритм 2+1 может формально держаться, но товарные всё
// равно выстроятся в одну колонку сетки 3×N (вертикальная полоса вместо
// чередования «крестиком») ---

function gridSlots(exhibitSlots) {
  const feed = [];
  for (let slot = 1; slot <= 15; slot += 1) {
    feed.push(goodPost({
      id: `g${slot}`,
      slot,
      exhibit: exhibitSlots.includes(slot) ? 'megalodon-tooth' : null,
    }));
  }
  return feed;
}

test('раскладка сетки: товарные в слотах 3,6,9,12,15 — все в одной колонке, отклоняется', () => {
  // Формально ритм 2+1 соблюдён (по одному товарному на тройку), но
  // ((slot-1)%3)+1 у всех пяти даёт колонку 3 — вертикальная полоса.
  const feed = gridSlots([3, 6, 9, 12, 15]);
  assert.equal(checkRhythm(feed).ok, true, 'ритм 2+1 в этой раскладке формально соблюдён');
  const r = checkGridLayout(feed);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /колонк/);
});

test('раскладка сетки: товарные в слотах 3,5,7,12,14 — колонки вразброс, проходит', () => {
  const feed = gridSlots([3, 5, 7, 12, 14]);
  assert.equal(checkRhythm(feed).ok, true, 'ритм 2+1 должен быть соблюдён и в рабочей раскладке');
  const r = checkGridLayout(feed);
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
  // Значения строк должны быть подтверждаемыми фактами (см. проверку
  // «карточка spec: каждая строка подтверждается фактом» ниже) — поэтому
  // вместо выдуманных «Значение N» берём реальные пять полей паспорта
  // megalodon-tooth (R–0201) из promo-data.js и регистрируем их фактами.
  const rows = [
    ['Среда обитания', 'Тёплые моря миоцена'],
    ['Классификация', 'Otodus megalodon, крупнейшая известная акула в истории океана'],
    ['Особенности', 'Высота коронки 14,5 см, зазубренная режущая кромка, полная эмаль'],
    ['Сохранность', 'Эмаль сохранилась целиком, кромка не сточена и не подправлена'],
    ['Ценность', 'Крупный зуб редкой степени сохранности, готовый самостоятельный экспонат'],
  ];
  assert.equal(rows.length, SPEC_MAX_ROWS, 'в фикстуре ровно SPEC_MAX_ROWS строк — иначе тест перестаёт быть тестом границы');
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: { name: 'Экспонат', rows } }],
    facts: rows.map(([label, value]) => ({
      claim: label,
      value,
      source: `promo-data.js:R–0201.profile.facts.${label}`,
      checked: true,
    })),
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

// --- карточка рубрики figure: показанное число обязано подтверждаться
// фактом поста (тот же пробел, что и у era, только раньше не проверялся) ---

test('пост с карточкой figure без подтверждающего факта отклоняется', () => {
  const r = validatePost(s, goodPost({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Сеймчан', big: '≈ 4,56 млрд лет', sub: 'x' } }],
    facts: [],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

test('пост с карточкой figure с подтверждающим фактом проходит', () => {
  const r = validatePost(s, goodPost({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Сеймчан', big: '≈ 4,56 млрд лет', sub: 'x' } }],
    facts: [{ claim: 'возраст', value: '≈ 4,56 млрд лет', source: 'catalog.js:seymchan-pallasite.age', checked: true }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

// --- карточка рубрики spec: каждая строка паспорта (второй элемент пары)
// обязана подтверждаться фактом поста ---

test('пост с карточкой spec: строка без подтверждающего факта отклоняется', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: {
      name: 'Зуб мегалодона',
      rows: [['Возраст', '≈ 23 млн лет, миоцен']],
    } }],
    facts: [],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

test('пост с карточкой spec: все строки с подтверждающими фактами проходят', () => {
  const r = validatePost(s, goodPost({
    frames: [{ type: 'card', tpl: 'spec', data: {
      name: 'Зуб мегалодона',
      rows: [['Возраст', '≈ 23 млн лет, миоцен'], ['Оформление', 'Стальной стенд']],
    } }],
    facts: [
      { claim: 'возраст', value: '≈ 23 млн лет, миоцен', source: 'catalog.js:megalodon-tooth.age', checked: true },
      { claim: 'оформление', value: 'Стальной стенд', source: 'catalog.js:megalodon-tooth.mount', checked: true },
    ],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

// --- C2: пропорция — свойство поста, а не кадра ---
//
// Instagram приводит карусель к одному соотношению сторон: если первый кадр
// собран 1:1, а остальные 4:5, зритель увидит кадры 4:5 обрезанными до
// квадрата — у карточки-паспорта срежется колонтитул. Пропорция задаётся
// один раз на пост (post.aspect) и применяется ко всем его кадрам; разнобой
// внутри поста валидатор обязан ловить.

test('разнобой пропорций внутри поста отклоняется', () => {
  const r = validatePost(s, goodPost({
    aspect: '1:1',
    frames: [
      { type: 'video', src: 'spin_megalodon.mp4', crop: '1:1' },
      { type: 'photo', src: 'int_ph_megalodon.jpg', crop: '4:5' },
      { type: 'card', tpl: 'end', data: {} },
    ],
  }));
  assert.equal(r.ok, false, 'кадры 1:1 и 4:5 в одном посте — брак карусели');
  assert.match(r.problems.join(' '), /пропорц/i);
});

test('разнобой пропорций ловится и без явного post.aspect (по умолчанию поста)', () => {
  const r = validatePost(s, goodPost({
    frames: [
      { type: 'video', src: 'spin_megalodon.mp4', crop: '1:1' },
      { type: 'photo', src: 'int_ph_megalodon.jpg', crop: '4:5' },
    ],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /пропорц/i);
});

test('пост с единой пропорцией 1:1 проходит', () => {
  const r = validatePost(s, goodPost({
    aspect: '1:1',
    frames: [
      { type: 'video', src: 'spin_megalodon.mp4' },
      { type: 'photo', src: 'int_ph_megalodon.jpg' },
      { type: 'card', tpl: 'end', data: {} },
    ],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('неизвестная пропорция поста отклоняется', () => {
  const r = validatePost(s, goodPost({ aspect: '16:9' }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /пропорц/i);
});

test('postAspect: явное поле поста важнее умолчания, умолчание зависит от формата', () => {
  assert.equal(postAspect({ format: 'carousel', aspect: '1:1' }), '1:1');
  assert.equal(postAspect({ format: 'single' }), '1:1');
  assert.equal(postAspect({ format: 'carousel' }), '4:5');
});

// --- C3: крупное поле карточки «Цифра» ---
//
// Кегль крупного поля — 168 пикселей: целая фраза с периодом переносится на
// три-четыре строки, выдавливает волосяную линейку и сажает подзаголовок на
// колонтитул. Общий предел в 220 знаков для такого кегля не связывает —
// нужен отдельный, короткий.

test('карточка «Цифра»: крупное поле длиннее предела отклоняется', () => {
  const r = validatePost(s, goodPost({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Трилобит', big: 'а'.repeat(MAX_BIG_LENGTH + 1), sub: 'x' } }],
    facts: [],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), new RegExp(`крупное поле.*${MAX_BIG_LENGTH} знаков`));
});

test('карточка «Цифра»: предел крупного поля 18–20 знаков и настоящие значения ленты в него влезают', () => {
  assert.ok(MAX_BIG_LENGTH >= 18 && MAX_BIG_LENGTH <= 20, `ожидали предел 18–20 знаков, а не ${MAX_BIG_LENGTH}`);
  for (const big of ['≈ 4,56 млрд лет', '≈ 360 млн лет', '≈ 480–472 млн лет', '≈ 245 млн лет']) {
    assert.ok(big.length <= MAX_BIG_LENGTH, `«${big}» (${big.length}) не влезает в предел ${MAX_BIG_LENGTH}`);
  }
});

test('карточка «Цифра»: период вынесен в подзаголовок, а сверяется показанное целиком', () => {
  // Период ушёл из крупного поля в data.period — но зритель по-прежнему видит
  // всё утверждение целиком, поэтому подтверждать факт обязано «крупное поле,
  // период», а не одно крупное поле.
  const r = validatePost(s, goodPost({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Трилобит', big: '≈ 480–472 млн лет', period: 'ранний ордовик', sub: 'x' } }],
    facts: [{ claim: 'возраст', value: '≈ 480–472 млн лет, ранний ордовик', source: 'catalog.js:0217-dikelokephalina.age', checked: true }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('карточка «Цифра»: период на карточке, которого нет в факте, не проходит', () => {
  const r = validatePost(s, goodPost({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Трилобит', big: '≈ 480–472 млн лет', period: 'поздний ордовик', sub: 'x' } }],
    facts: [{ claim: 'возраст', value: '≈ 480–472 млн лет, ранний ордовик', source: 'catalog.js:0217-dikelokephalina.age', checked: true }],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /не подтверждена фактом/);
});

// --- C1: реконструкция должна называться реконструкцией ---
//
// Машинная сверка проверяет дословное совпадение с полем age, но не то, к чему
// число относится: у реконструкции возраст принадлежит виду, а не предмету.
// Если паспорт экспоната (location/description) говорит «реконструкция», пост
// обязан назвать это в тексте карточки или в подписи.

function reconstructionPost(over = {}) {
  return goodPost(Object.assign({
    rubric: 'figure',
    exhibit: null,
    frames: [{ type: 'card', tpl: 'figure', data: { name: 'Dunkleosteus', big: '≈ 360 млн лет', period: 'поздний девон', sub: 'Возраст панцирной рыбы как вида.' } }],
    caption: { lead: 'Броня вместо зубов', body: 'Панцирная рыба девонских морей.', cta: '' },
    facts: [{ claim: 'возраст', value: '≈ 360 млн лет, поздний девон', source: 'catalog.js:0219-dunkleosteus.age', checked: true }],
  }, over));
}

test('пост об экспонате-реконструкции без слова «реконструкция» отклоняется', () => {
  const r = validatePost(s, reconstructionPost());
  assert.equal(r.ok, false, 'возраст вида выдан за возраст предмета — это брак');
  assert.match(r.problems.join(' '), /реконструкц/i);
});

test('пост об экспонате-реконструкции проходит, если карточка называет это прямо', () => {
  const r = validatePost(s, reconstructionPost({
    frames: [{ type: 'card', tpl: 'figure', data: {
      name: 'Dunkleosteus',
      big: '≈ 360 млн лет',
      period: 'поздний девон',
      sub: 'Возраст панцирной рыбы как вида. Сам объект — научная реконструкция черепа.',
    } }],
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('пост об экспонате-реконструкции проходит, если это названо в подписи', () => {
  const r = validatePost(s, reconstructionPost({
    caption: {
      lead: 'Броня вместо зубов',
      body: 'Объект в галерее — реконструкция черепа и головного щита по научным данным.',
      cta: '',
    },
  }));
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('привязка через post.exhibit тоже включает проверку реконструкции', () => {
  const r = validatePost(s, reconstructionPost({
    exhibit: '0219-dunkleosteus',
    rubric: 'object',
    frames: [{ type: 'card', tpl: 'end', data: {} }],
    facts: [],
  }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /реконструкц/i);
});

test('обычный ископаемый экспонат слова «реконструкция» не требует', () => {
  const r = validatePost(s, goodPost());
  assert.equal(r.ok, true, r.problems.join('; '));
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
