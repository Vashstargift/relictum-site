// Схема Instagram-поста галереи Relictum и проверка ритма ленты «2+1».
//
// Правило дома: лента читается сеткой по три плитки в ряд. Тройки задаются
// НОМЕРОМ слота, а не позицией поста в массиве: пост со slot=n принадлежит
// тройке Math.floor((n-1)/3), то есть {1,2,3}, {4,5,6}, {7,8,9}... Если
// тройка собрана целиком (все три слота есть в ленте), в ней должен быть
// ровно один товарный пост (задан post.exhibit), остальные два —
// «воздушные» (exhibit: null). Если тройка неполная (в ленте есть не все
// три слота), отсутствие постов само по себе нарушением не считается, но
// два и более товарных поста в такой тройке — всё равно брак.

const fs = require('fs');
const path = require('path');
const { IMG_DIR } = require('./paths.js');
const { findExhibit } = require('./sources.js');
const { checkPostFacts } = require('./facts.js');

const RUBRICS = ['object', 'figure', 'era', 'interior', 'expedition', 'ritual', 'editions'];
const TEMPLATES = ['cover', 'figure', 'era', 'spec', 'end'];
const FORMATS = ['carousel', 'reel', 'single'];
const CROPS = ['4:5', '1:1'];
const STATUSES = ['draft', 'ready', 'blocked'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Пределы данных карточки — правильное место остановить перегруз контента
// это валидатор ленты («сократи»), а не рендерер, который молча ужимает
// шрифт до нечитаемого. Карточки должны быть свёрстаны, а не подогнаны.
const SPEC_MAX_ROWS = 5; // паспорт (tpl=spec): не больше строк в data.rows
const MAX_TEXT_LENGTH = 220; // любое текстовое значение в data карточки
const MAX_TITLE_LENGTH = 60; // заголовок карточки: data.title/data.name

// Поле заголовка карточки для каждого шаблона, где заголовок есть.
const TITLE_FIELD_BY_TEMPLATE = { cover: 'title', spec: 'name', figure: 'name' };

// Обходит data кадра карточки рекурсивно (объекты и массивы, напр. рядки
// паспорта data.rows) и собирает все строковые значения вместе с их путём
// (для сообщения об ошибке) — так предел длины проверяется одинаково для
// любого текстового поля, а не только для перечисленных по имени.
function collectTexts(value, fieldPath, out) {
  if (typeof value === 'string') {
    out.push({ path: fieldPath, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectTexts(v, `${fieldPath}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => collectTexts(v, fieldPath ? `${fieldPath}.${k}` : k, out));
  }
}

// Проверка данных кадра типа card: пределы на паспорт (spec), длину любого
// текстового значения и длину заголовка карточки. bad(msg) уже знает id
// поста, сюда передаём только текст «что именно превышено».
function validateCardData(frame, frameLabel, bad) {
  const data = frame.data || {};

  const titleField = TITLE_FIELD_BY_TEMPLATE[frame.tpl];
  if (titleField && typeof data[titleField] === 'string' && data[titleField].length > MAX_TITLE_LENGTH) {
    bad(`${frameLabel}: заголовок карточки («${titleField}») длиннее ${MAX_TITLE_LENGTH} знаков (сейчас ${data[titleField].length})`);
  }

  if (frame.tpl === 'spec') {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length > SPEC_MAX_ROWS) {
      bad(`${frameLabel}: в паспорте больше ${SPEC_MAX_ROWS} строк в data.rows (сейчас ${rows.length}) — сократи паспорт`);
    }
    rows.forEach((row, i) => {
      const isPair = Array.isArray(row) && row.length === 2
        && typeof row[0] === 'string' && row[0].trim() !== ''
        && typeof row[1] === 'string' && row[1].trim() !== '';
      if (!isPair) {
        bad(`${frameLabel}: строка паспорта ${i + 1} (data.rows[${i}]) должна быть парой из двух непустых строк`);
      }
    });
  }

  const texts = [];
  collectTexts(data, '', texts);
  texts.forEach(({ path, text }) => {
    if (text.length > MAX_TEXT_LENGTH) {
      bad(`${frameLabel}: текст в data.${path} длиннее ${MAX_TEXT_LENGTH} знаков (сейчас ${text.length}) — сократи`);
    }
  });
}

// Проверка одного поста: обязательные поля, рубрика, формат, статус,
// привязка к экспонату каталога, кадры (файлы в shared/img существуют,
// src — имя файла, а не путь/URL), подпись и сверка фактов с паспортами.
function validatePost(sources, post) {
  const problems = [];

  // Пост целиком отсутствует (null/undefined) — дальше нечего проверять,
  // без ранней остановки следующая же строка уронит всё исключением.
  // Формулировка отдельная от «нет поля id»: там пост есть, просто без
  // одного поля, а здесь нет самого поста — это разные вещи.
  if (!post) {
    problems.push('(без id): поста нет вовсе — элемент ленты пуст (null/undefined)');
    return { ok: false, problems };
  }

  const id = post.id ? post.id : '(без id)';
  const bad = (msg) => problems.push(`${id}: ${msg}`);

  if (!post.id) bad('нет поля id');
  if (!DATE_RE.test(post.date || '')) bad(`дата должна быть в формате ГГГГ-ММ-ДД, а не «${post.date}»`);
  if (!RUBRICS.includes(post.rubric)) bad(`неизвестная рубрика «${post.rubric}»`);
  if (!Number.isInteger(post.slot) || post.slot < 1) bad(`slot должен быть целым ≥1, а не «${post.slot}»`);
  if (!FORMATS.includes(post.format)) bad(`неизвестный формат «${post.format}»`);
  if (!STATUSES.includes(post.status)) bad(`неизвестный статус «${post.status}»`);

  if (post.exhibit !== null && post.exhibit !== undefined) {
    if (!findExhibit(sources, post.exhibit)) bad(`экспонат «${post.exhibit}» не найден в каталоге`);
  }

  if (!Array.isArray(post.frames) || post.frames.length === 0) {
    bad('нет ни одного кадра');
  } else {
    post.frames.forEach((f, i) => {
      const n = `кадр ${i + 1}`;
      if (f.type === 'video' || f.type === 'photo') {
        if (!f.src) return bad(`${n}: нет src`);
        if (/[:/\\]/.test(f.src)) return bad(`${n}: src должен быть именем файла в shared/img, а не путём`);
        if (!fs.existsSync(path.join(IMG_DIR, f.src))) bad(`${n}: файл «${f.src}» не найден в shared/img`);
        if (f.crop && !CROPS.includes(f.crop)) bad(`${n}: неизвестный кроп «${f.crop}»`);
      } else if (f.type === 'card') {
        if (!TEMPLATES.includes(f.tpl)) bad(`${n}: неизвестный шаблон «${f.tpl}»`);
        else validateCardData(f, n, bad);
      } else {
        bad(`${n}: неизвестный тип «${f.type}»`);
      }
    });
  }

  if (!post.caption || !post.caption.lead) bad('нет подписи (caption.lead)');

  // Сверка фактов делегирована facts.js — там же учтена привязка факта
  // к экспонату поста (post.exhibit), дублировать эту логику не нужно.
  problems.push(...checkPostFacts(sources, post).problems);

  return { ok: problems.length === 0, problems };
}

// Ритм «2+1»: группируем посты по номеру тройки, вычисленному из slot
// (пост со slot=n принадлежит тройке Math.floor((n-1)/3)), а не по позиции
// в массиве — иначе дыра в нумерации слотов сдвигает группы и прячет
// настоящее нарушение. Посты с негодным slot (не целое число ≥1) в
// группировке не участвуют — это уже отдельно ловит validatePost.
//
// Для тройки, где в ленте есть все три слота (полная), требуется ровно
// один товарный пост. Для неполной тройки (не все три слота представлены)
// отсутствие постов само по себе не нарушение, но два и более товарных —
// нарушение независимо от полноты.
function checkRhythm(feed) {
  const problems = [];
  const valid = feed.filter((p) => p && Number.isInteger(p.slot) && p.slot >= 1);

  const groups = new Map(); // индекс тройки -> посты этой тройки
  for (const p of valid) {
    const idx = Math.floor((p.slot - 1) / 3);
    if (!groups.has(idx)) groups.set(idx, []);
    groups.get(idx).push(p);
  }

  const sortedIdx = [...groups.keys()].sort((a, b) => a - b);
  for (const idx of sortedIdx) {
    const group = groups.get(idx).slice().sort((a, b) => a.slot - b.slot);
    const tripleSlots = [idx * 3 + 1, idx * 3 + 2, idx * 3 + 3];
    // Полнота тройки — по числу РАЗНЫХ слотов, а не по числу постов: дубль
    // слота (два поста с одним и тем же slot) не должен превращать полную
    // тройку в неполную и подменять строгое «ровно 1» на мягкое «не
    // больше 1» — иначе тройка с нулём товарных при дубле слота молчаливо
    // проходит проверку.
    const distinctSlots = new Set(group.map((p) => p.slot)).size;
    const isComplete = tripleSlots.every((slot) => group.some((p) => p.slot === slot)) && distinctSlots === 3;
    const goodPosts = group.filter((p) => p.exhibit !== null && p.exhibit !== undefined);
    const goods = goodPosts.length;

    const violated = isComplete ? goods !== 1 : goods > 1;
    if (violated) {
      const need = isComplete ? 'ровно 1' : 'не больше 1';
      const postsDesc = group.map((p) => `${p.id} (slot ${p.slot})`).join(', ');
      problems.push(
        `ритм 2+1 нарушен в тройке слотов {${tripleSlots.join(', ')}}: товарных ${goods}, а должно быть ${need}; посты в тройке: ${postsDesc}`
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

// Проверка всей ленты: каждый пост по отдельности + отсутствие дублей
// slot/id + ритм 2+1.
function validateFeed(sources, feed) {
  const problems = [];
  const posts = feed.map((p) => {
    const r = validatePost(sources, p);
    const id = p && p.id ? p.id : '(без id)';
    return { id, ok: r.ok, problems: r.problems };
  });

  // Битые элементы (null/undefined) уже отражены в problems через
  // validatePost выше — здесь их просто пропускаем, чтобы не упасть.
  const seenSlot = new Map();
  for (const p of feed) {
    if (!p) continue;
    if (seenSlot.has(p.slot)) problems.push(`slot ${p.slot} занят дважды: ${seenSlot.get(p.slot)} и ${p.id}`);
    else seenSlot.set(p.slot, p.id);
  }

  const seenId = new Set();
  for (const p of feed) {
    if (!p) continue;
    if (seenId.has(p.id)) problems.push(`id «${p.id}» встречается дважды`);
    seenId.add(p.id);
  }

  problems.push(...checkRhythm(feed).problems);

  const ok = problems.length === 0 && posts.every((p) => p.ok);
  return { ok, posts, problems };
}

module.exports = {
  RUBRICS,
  TEMPLATES,
  SPEC_MAX_ROWS,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  validatePost,
  checkRhythm,
  validateFeed,
};
