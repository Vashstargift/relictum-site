const test = require('node:test');
const assert = require('node:assert');
const { loadSources, findExhibit, findPromo } = require('../lib/sources.js');

test('loadSources отдаёт каталог и промо', () => {
  const s = loadSources();
  assert.ok(Array.isArray(s.catalog), 'catalog должен быть массивом');
  assert.ok(s.catalog.length >= 70, `ожидали ≥70 экспонатов, получили ${s.catalog.length}`);
  assert.equal(typeof s.promo, 'object');
});

test('loadSources можно звать дважды', () => {
  const a = loadSources();
  const b = loadSources();
  assert.equal(a.catalog.length, b.catalog.length);
});

test('findExhibit ищет по slug', () => {
  const s = loadSources();
  const o = findExhibit(s, 'megalodon-tooth');
  assert.ok(o, 'мегалодон должен найтись');
  assert.equal(o.name, 'Зуб мегалодона');
  assert.equal(findExhibit(s, 'нет-такого'), null);
});

test('findPromo ищет по id с длинным тире', () => {
  const s = loadSources();
  assert.ok(findPromo(s, 'R–0609'), 'R–0609 должен найтись');
  assert.equal(findPromo(s, 'R-0609'), null, 'короткое тире не должно совпадать');
});
