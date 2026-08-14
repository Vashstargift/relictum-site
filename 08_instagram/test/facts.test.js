const test = require('node:test');
const assert = require('node:assert');
const { loadSources } = require('../lib/sources.js');
const { resolveSource, checkFact, checkPostFacts } = require('../lib/facts.js');

const s = loadSources();

test('resolveSource достаёт поле из каталога по slug', () => {
  const r = resolveSource(s, 'catalog.js:megalodon-tooth.age');
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.value, '≈ 23 млн лет, миоцен');
});

test('resolveSource ходит вглубь по точкам', () => {
  const r = resolveSource(s, 'promo-data.js:R–0609.hook');
  assert.equal(r.ok, true, r.reason);
  assert.equal(typeof r.value, 'string');
});

test('resolveSource ругается на неизвестный файл', () => {
  const r = resolveSource(s, 'выдумка.js:x.y');
  assert.equal(r.ok, false);
  assert.match(r.reason, /неизвестный файл/);
});

test('resolveSource ругается на отсутствующую запись', () => {
  const r = resolveSource(s, 'catalog.js:нет-такого.age');
  assert.equal(r.ok, false);
  assert.match(r.reason, /не нашёл запись/);
});

test('checkFact ловит расхождение значения', () => {
  const bad = { claim: 'возраст', value: '≈ 100 млн лет', source: 'catalog.js:megalodon-tooth.age', checked: true };
  const r = checkFact(s, bad);
  assert.equal(r.ok, false);
  assert.match(r.reason, /не совпадает/);
});

test('checkFact пропускает совпадающее значение', () => {
  const good = { claim: 'возраст', value: '≈ 23 млн лет, миоцен', source: 'catalog.js:megalodon-tooth.age', checked: true };
  assert.equal(checkFact(s, good).ok, true);
});

test('checkFact требует checked=true', () => {
  const f = { claim: 'возраст', value: '≈ 23 млн лет, миоцен', source: 'catalog.js:megalodon-tooth.age', checked: false };
  const r = checkFact(s, f);
  assert.equal(r.ok, false);
  assert.match(r.reason, /не отмечен проверенным/);
});

test('checkPostFacts собирает проблемы по всем фактам', () => {
  const post = { id: 'p01', facts: [
    { claim: 'возраст', value: 'враньё', source: 'catalog.js:megalodon-tooth.age', checked: true },
  ] };
  const r = checkPostFacts(s, post);
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
});

test('пост без фактов допустим', () => {
  assert.equal(checkPostFacts(s, { id: 'p02', facts: [] }).ok, true);
});

// --- Находка 1 (critical): факт обязан ссылаться на СВОЙ экспонат поста ---

test('checkPostFacts запрещает факт, подтверждённый паспортом чужого экспоната', () => {
  const fakePost = {
    id: 'p-fraud',
    exhibit: 'megalodon-tooth',
    facts: [{ claim: 'возраст', value: 'более 12 000 лет, плейстоцен',
              source: 'catalog.js:cave-bear-skeleton.age', checked: true }]
  };
  const r = checkPostFacts(s, fakePost);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /чужой экспонат/);
});

test('checkPostFacts пропускает факт catalog.js со своим экспонатом', () => {
  const post = {
    id: 'p-own-catalog',
    exhibit: 'megalodon-tooth',
    facts: [{ claim: 'возраст', value: '≈ 23 млн лет, миоцен',
              source: 'catalog.js:megalodon-tooth.age', checked: true }]
  };
  assert.equal(checkPostFacts(s, post).ok, true);
});

test('checkPostFacts запрещает факт promo-data.js с чужим id', () => {
  // у megalodon-tooth id = R–0201, а не R–0609 (это cave-bear-skeleton)
  const post = {
    id: 'p-fraud-promo',
    exhibit: 'megalodon-tooth',
    facts: [{ claim: 'зацепка', value: 'что угодно',
              source: 'promo-data.js:R–0609.hook', checked: true }]
  };
  const r = checkPostFacts(s, post);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /чужой экспонат/);
});

test('checkPostFacts пропускает факт promo-data.js со своим id', () => {
  const own = resolveSource(s, 'promo-data.js:R–0201.hook');
  assert.equal(own.ok, true, own.reason);
  const post = {
    id: 'p-own-promo',
    exhibit: 'megalodon-tooth',
    facts: [{ claim: 'зацепка', value: own.value,
              source: 'promo-data.js:R–0201.hook', checked: true }]
  };
  assert.equal(checkPostFacts(s, post).ok, true);
});

test('checkPostFacts: у поста без привязки к экспонату (exhibit: null) допустим любой ключ', () => {
  const post = {
    id: 'p-generic',
    exhibit: null,
    facts: [{ claim: 'возраст', value: '≈ 23 млн лет, миоцен',
              source: 'catalog.js:megalodon-tooth.age', checked: true }]
  };
  assert.equal(checkPostFacts(s, post).ok, true);
});

// --- Находка 2 (important): резолв обязан доходить до скаляра ---

test('resolveSource отказывает, если путь ведёт в объект, а не в значение', () => {
  const r = resolveSource(s, 'promo-data.js:R–0609.profile.facts');
  assert.equal(r.ok, false);
  assert.match(r.reason, /объект/);
});

test('resolveSource отказывает, если путь ведёт в массив, а не в значение', () => {
  const r = resolveSource(s, 'promo-data.js:R–0609.gallery');
  assert.equal(r.ok, false);
  assert.match(r.reason, /список/);
});

// --- Находка 3 (minor): value: 0 — легитимное значение, а не «поля нет» ---

test('checkFact не путает value: 0 с отсутствующим полем', () => {
  const f = { claim: 'нулевое поле', value: 0, source: 'catalog.js:нет-такого.age', checked: true };
  const r = checkFact(s, f);
  // с багом упало бы раньше, на "нет поля «value»"; здесь должны дойти до resolveSource
  assert.equal(r.ok, false);
  assert.match(r.reason, /не нашёл запись/);
});

test('checkFact по-прежнему считает пустую строку отсутствующим полем', () => {
  const f = { claim: 'пустое поле', value: '', source: 'catalog.js:megalodon-tooth.age', checked: true };
  const r = checkFact(s, f);
  assert.equal(r.ok, false);
  assert.match(r.reason, /нет поля/);
});
