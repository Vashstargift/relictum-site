// Схема Instagram-поста галереи Relictum и проверка ритма ленты «2+1».
//
// Правило дома: лента читается сеткой по три плитки в ряд. В каждой тройке
// подряд идущих слотов (по возрастанию post.slot) ровно один пост товарный
// (задан post.exhibit), остальные два — «воздушные» (exhibit: null). При
// скролле это читается крестиком; нарушение ритма — брак ленты.

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

// Проверка одного поста: обязательные поля, рубрика, формат, статус,
// привязка к экспонату каталога, кадры (файлы в shared/img существуют,
// src — имя файла, а не путь/URL), подпись и сверка фактов с паспортами.
function validatePost(sources, post) {
  const problems = [];
  const id = post && post.id ? post.id : '(без id)';
  const bad = (msg) => problems.push(`${id}: ${msg}`);

  if (!post || !post.id) bad('нет поля id');
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

// Ритм «2+1»: сортируем ленту по slot и режем на тройки подряд идущих
// постов. В каждой полной тройке должен быть ровно один товарный пост
// (post.exhibit не null/undefined). Хвост короче трёх постов не проверяем —
// ритм оценивается только на завершённых тройках.
function checkRhythm(feed) {
  const problems = [];
  const sorted = [...feed].sort((a, b) => a.slot - b.slot);
  for (let i = 0; i < sorted.length; i += 3) {
    const group = sorted.slice(i, i + 3);
    if (group.length < 3) break;
    const goods = group.filter((p) => p.exhibit !== null && p.exhibit !== undefined).length;
    if (goods !== 1) {
      const ids = group.map((p) => p.id).join(', ');
      problems.push(`ритм 2+1 нарушен в тройке (${ids}): товарных ${goods}, а должен быть 1`);
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
    return { id: p.id, ok: r.ok, problems: r.problems };
  });

  const seenSlot = new Map();
  for (const p of feed) {
    if (seenSlot.has(p.slot)) problems.push(`slot ${p.slot} занят дважды: ${seenSlot.get(p.slot)} и ${p.id}`);
    else seenSlot.set(p.slot, p.id);
  }

  const seenId = new Set();
  for (const p of feed) {
    if (seenId.has(p.id)) problems.push(`id «${p.id}» встречается дважды`);
    seenId.add(p.id);
  }

  problems.push(...checkRhythm(feed).problems);

  const ok = problems.length === 0 && posts.every((p) => p.ok);
  return { ok, posts, problems };
}

module.exports = { RUBRICS, TEMPLATES, validatePost, checkRhythm, validateFeed };
