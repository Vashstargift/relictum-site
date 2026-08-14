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
//
// Привязка факта к экспоненту поста: если у поста задан post.exhibit
// (не null), КАЖДЫЙ его факт обязан ссылаться именно на этот экспонат —
// иначе можно «подтвердить» число паспортом соседнего товара. Для
// catalog.js ключ ссылки должен совпадать с post.exhibit (это slug).
// Для promo-data.js ключ должен совпадать с полем id того же экспоната
// (экспонат ищем через findExhibit(sources, post.exhibit)). Если
// post.exhibit равен null (или не задан) — пост не привязан к товару,
// ссылка может указывать на любой ключ.

const { findExhibit, findPromo } = require('./sources.js');

const REF_RE = /^([^:]+):([^.]+)\.(.+)$/;

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

  let root;
  if (file === 'catalog.js') root = findExhibit(sources, key);
  else if (file === 'promo-data.js') root = findPromo(sources, key);
  else return { ok: false, value: null, reason: `неизвестный файл «${file}»` };

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
    if (parsed.file === 'catalog.js' && parsed.key !== exhibit.slug) {
      return {
        ok: false,
        reason: `факт «${fact.claim}» ссылается на чужой экспонат «${parsed.key}» (catalog.js), для этого поста ожидался «${exhibit.slug}»`,
        actual: null,
      };
    }
    if (parsed.file === 'promo-data.js' && parsed.key !== exhibit.id) {
      return {
        ok: false,
        reason: `факт «${fact.claim}» ссылается на чужой экспонат «${parsed.key}» (promo-data.js), для этого поста ожидался «${exhibit.id}»`,
        actual: null,
      };
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
  let exhibit = null;
  if (post.exhibit) {
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
