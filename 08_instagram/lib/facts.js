const { findExhibit, findPromo } = require('./sources.js');

const REF_RE = /^([^:]+):([^.]+)\.(.+)$/;

function norm(v) {
  return String(v).replace(/\s+/g, ' ').trim();
}

function resolveSource(sources, ref) {
  const m = REF_RE.exec(String(ref || ''));
  if (!m) return { ok: false, value: null, reason: `не разобрал ссылку «${ref}»` };
  const [, file, key, fieldPath] = m;

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
  if (cur === undefined || cur === null || norm(cur) === '') {
    return { ok: false, value: null, reason: `поле «${fieldPath}» в ${key} пустое` };
  }
  return { ok: true, value: norm(cur), reason: null };
}

function checkFact(sources, fact) {
  for (const key of ['claim', 'value', 'source']) {
    if (!fact || !fact[key]) return { ok: false, reason: `у факта нет поля «${key}»`, actual: null };
  }
  if (fact.checked !== true) {
    return { ok: false, reason: `факт «${fact.claim}» не отмечен проверенным`, actual: null };
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
  for (const f of facts) {
    const r = checkFact(sources, f);
    if (!r.ok) problems.push(`${post.id}: ${r.reason}`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { resolveSource, checkFact, checkPostFacts };
