// Сверка фактов Instagram-постов галереи Relictum с паспортами экспонатов.
//
// Правило дома: «не сверено — не публикуется». Модуль проверяет, что
// значение, заявленное в посте (fact.value), действительно записано
// в источнике данных, а не где-то похожем.
//
// Формат ссылки на источник (fact.source):
//   <файл>:<ключ>.<путь.к.полю>
//   catalog.js:<slug>.<путь>       — экспонат из shared/catalog.js, ключ — slug
//   promo-data.js:<id>.<путь>      — запись из promo-data.js, ключ — id (вида «R–0609», длинное тире)
//   eras.js:<slug>.<путь>          — геологическое подразделение из eras-data.js, ключ — слаг записи
//
// Привязка факта к экспоненту поста: если у поста задан post.exhibit
// (не null), КАЖДЫЙ его факт обязан ссылаться именно на этот экспонат —
// иначе можно «подтвердить» число паспортом соседнего товара. Для
// catalog.js ключ ссылки должен совпадать с post.exhibit (это slug).
// Для promo-data.js ключ должен совпадать с полем id того же экспоната
// (экспонат ищем через findExhibit(sources, post.exhibit)). Если
// post.exhibit равен null (или не задан) — пост не привязан к товару,
// ссылка может указывать на любой ключ. Для eras.js привязка к экспонату
// не проверяется вовсе (эпоха не принадлежит конкретному экспонату) —
// у источника просто нет expectedKey, и проверка привязки его молча
// пропускает.

const { findExhibit, findPromo, findEra } = require('./sources.js');

const REF_RE = /^([^:]+):([^.]+)\.(.+)$/;

// Единая таблица источников: где искать запись по ключу (find) и какой
// ключ считается «своим» для экспонанта поста (expectedKey). И resolveSource,
// и проверка привязки в checkFact берут ветвление file → логика отсюда,
// чтобы при добавлении нового источника не забыть поправить обе ветки.
const SOURCE_FILES = {
  'catalog.js': {
    find: (sources, key) => findExhibit(sources, key),
    // для catalog.js ключ ссылки должен совпадать со slug'ом поста
    expectedKey: (exhibit) => exhibit.slug,
  },
  'promo-data.js': {
    find: (sources, key) => findPromo(sources, key),
    // для promo-data.js ключ ссылки должен совпадать с полем id того же
    // экспоната; если экспонат поста не нашёлся в каталоге — id узнать
    // неоткуда (см. отдельную проверку в checkFact)
    expectedKey: (exhibit) => exhibit.id,
  },
  'eras.js': {
    find: (sources, key) => findEra(sources, key),
    // expectedKey нарочно нет: эпоха не принадлежит конкретному
    // экспонату, привязка к post.exhibit на этот источник не
    // распространяется.
  },
};

function norm(v) {
  return String(v).replace(/\s+/g, ' ').trim();
}

// Разбирает ссылку на источник вида "файл:ключ.путь.к.полю".
// Возвращает null, если формат не распознан.
function parseRef(ref) {
  const m = REF_RE.exec(String(ref || ''));
  if (!m) return null;
  const [, file, key, fieldPath] = m;
  return { file, key, fieldPath };
}

function resolveSource(sources, ref) {
  const parsed = parseRef(ref);
  if (!parsed) return { ok: false, value: null, reason: `не разобрал ссылку «${ref}»` };
  const { file, key, fieldPath } = parsed;

  const def = SOURCE_FILES[file];
  if (!def) return { ok: false, value: null, reason: `неизвестный файл «${file}»` };
  const root = def.find(sources, key);

  if (!root) return { ok: false, value: null, reason: `не нашёл запись «${key}» в ${file}` };

  let cur = root;
  for (const part of fieldPath.split('.')) {
    if (cur === null || typeof cur !== 'object') {
      return { ok: false, value: null, reason: `нет поля «${fieldPath}» в ${key}` };
    }
    cur = cur[part];
  }

  if (cur === undefined || cur === null) {
    return { ok: false, value: null, reason: `поле «${fieldPath}» в ${key} пустое` };
  }
  // Резолв обязан дойти до скаляра — объект или массив это не значение,
  // а полдороги к нему, молча превращать их в строку через String() нельзя
  // ("[object Object]", список через запятую), это ложное подтверждение.
  if (typeof cur === 'object') {
    const kind = Array.isArray(cur) ? 'список' : 'объект';
    return { ok: false, value: null, reason: `поле «${fieldPath}» в ${key} — это ${kind}, а не значение (нужны строка или число)` };
  }
  if (typeof cur !== 'string' && typeof cur !== 'number') {
    return { ok: false, value: null, reason: `поле «${fieldPath}» в ${key} не является простым значением` };
  }
  if (norm(cur) === '') {
    return { ok: false, value: null, reason: `поле «${fieldPath}» в ${key} пустое` };
  }
  return { ok: true, value: norm(cur), reason: null };
}

// exhibit — необязательная привязка поста к экспоненту:
//   { slug, id } — факт обязан ссылаться на этот же экспонат
//   null/undefined — привязки нет, ссылка может указывать на что угодно
function checkFact(sources, fact, exhibit) {
  for (const key of ['claim', 'value', 'source']) {
    const v = fact ? fact[key] : undefined;
    // undefined/null/'' — поля нет. Ложные, но валидные значения (0, false)
    // не должны считаться отсутствием поля.
    if (v === undefined || v === null || v === '') {
      return { ok: false, reason: `у факта нет поля «${key}»`, actual: null };
    }
  }
  if (fact.checked !== true) {
    return { ok: false, reason: `факт «${fact.claim}» не отмечен проверенным`, actual: null };
  }

  const parsed = parseRef(fact.source);
  if (!parsed) return { ok: false, reason: `не разобрал ссылку «${fact.source}»`, actual: null };

  if (exhibit) {
    const def = SOURCE_FILES[parsed.file];
    // def без expectedKey (сейчас — eras.js) на привязку к экспонату
    // не претендует: эпоха не принадлежит конкретному экспонату, и её
    // ключ разрешён любым независимо от post.exhibit.
    if (def && def.expectedKey) {
      const expected = def.expectedKey(exhibit);
      if (expected === null) {
        // Экспонат поста не нашёлся в каталоге вообще — сравнивать ключ
        // не с чем, и подставлять «ожидался «null»» в сообщение нельзя,
        // это нечитаемо. Говорим прямо, в чём дело.
        return {
          ok: false,
          reason: `факт «${fact.claim}»: экспонат поста «${exhibit.slug}» не найден в catalog.js, привязку к ${parsed.file} проверить нельзя`,
          actual: null,
        };
      }
      if (parsed.key !== expected) {
        return {
          ok: false,
          reason: `факт «${fact.claim}» ссылается на чужой экспонат «${parsed.key}» (${parsed.file}), для этого поста ожидался «${expected}»`,
          actual: null,
        };
      }
    }
  }

  const r = resolveSource(sources, fact.source);
  if (!r.ok) return { ok: false, reason: r.reason, actual: null };
  if (norm(fact.value) !== r.value) {
    return { ok: false, reason: `значение «${fact.value}» не совпадает с источником «${r.value}»`, actual: r.value };
  }
  return { ok: true, reason: null, actual: r.value };
}

function checkPostFacts(sources, post) {
  const facts = Array.isArray(post.facts) ? post.facts : [];
  const problems = [];

  // Привязка поста к экспонату: если post.exhibit задан, вычисляем
  // ожидаемые ключи для обоих файлов-источников заранее, один раз.
  // Явная проверка на null/undefined, а не truthy: '', 0, false — валидные
  // (хоть и странные) значения slug'а, и не должны отключать привязку.
  let exhibit = null;
  if (post.exhibit !== null && post.exhibit !== undefined) {
    const found = findExhibit(sources, post.exhibit);
    exhibit = { slug: post.exhibit, id: found ? found.id : null };
  }

  for (const f of facts) {
    const r = checkFact(sources, f, exhibit);
    if (!r.ok) problems.push(`${post.id}: ${r.reason}`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { resolveSource, checkFact, checkPostFacts };
