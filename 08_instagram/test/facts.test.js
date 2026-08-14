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
