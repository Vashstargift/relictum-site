# Instagram-конвейер Relictum — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать конвейер, который из уже снятых ассетов и данных каталога выдаёт готовые к постингу файлы Instagram-постов и борд с обзором всей ленты.

**Architecture:** Данные ленты живут в одном файле `feed-data.js`. Чистые модули в `lib/` загружают каталог, резолвят источники фактов и валидируют посты. Два рендерера: карточки — headless Chrome по HTML-шаблонам на шрифтах сайта, видео — ffmpeg центральным кропом. CLI `build_feed.js` связывает всё и пишет папку на пост. Борд `index.html` читает `feed-data.js` и показывает сетку, календарь и статусы.

**Tech Stack:** Node.js v25.8.1 (CommonJS, **ноль npm-зависимостей**), встроенный тест-раннер `node:test`, headless Chrome, ffmpeg 8.0.1.

## Global Constraints

- **Никаких npm-зависимостей.** В репозитории нет `package.json` и его не заводим. Только стандартная библиотека Node + внешние бинарники Chrome и ffmpeg через `child_process`.
- **Шрифты только локальные.** Шаблоны подключают `shared/fonts.css`. Ссылки на `fonts.googleapis.com` запрещены (правило дома).
- **На `public/` не ссылаться** — каталог собирается скриптом и лежит в `.gitignore`.
- **Ключи разных файлов разные:** `shared/catalog.js` адресуется по `slug`, `16_product_promos/promo-data.js` — по `id` вида `R–0609` (тире ДЛИННОЕ, U+2013).
- **Конвейер обязан работать при нулевом балансе Higgsfield** (сейчас 2.37 кредита). Ни один шаг сборки не вызывает модели.
- **Ничего уже снятого не перегенерируем.** `frames[].src` — только имя файла в `shared/img`, без внешних URL.
- Цвета дома: ivory `#F4F0E8`, bone `#FBF8F1`, black `#111111`, bronze `#B08A55`, deep `#9A6D34`, stone `#7A7267`.
- Тексты: люксовый регистр, без буллет-пойнтов, цена — «по запросу в галерею», тема подлинности на витрине не поднимается.
- Экспонат `R–0228` (череп пещерного льва № 2): генерация новых ракурсов запрещена, только кропы исходника.
- Коммиты после каждой задачи. **Push не делать** — публикация только по команде владельца.

## Проверенные факты окружения

Всё ниже проверено на этой машине 14.08.2026, можно опираться без перепроверки:

| Что | Значение |
|---|---|
| Chrome | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Снимок 1080×1350 | получается, кириллица и `shared/fonts.css` подхватываются |
| Шум Chrome в stderr | `CVDisplayLinkCreateWithCGDisplay failed`, `Trying to load the allocator multiple times` — **безвредны**, успех определять по строке `written to file` |
| Спины | горизонтальные ≈1284×716, звук `aac` есть (в `SPIN_VIDEOS.md` написано «9:16» — **неверно**) |
| Интерьеры | ≈1200×808 |
| Эпохи | ≈1928×1076 |
| Кроп 4:5 | `crop=ih*4/5:ih,scale=1080:1350:flags=lanczos` — объект и подставка в кадре целиком |
| Кроп 1:1 | `crop=ih:ih,scale=1080:1080:flags=lanczos` |
| Подложки | размытая подложка даёт призрак объекта, заливка цветом даёт видимый шов — **обе отклонены**, только центральный кроп |
| Экспонатов с полным набором | 36 (`spin` + `interior` + `gallery` ≥ 4) — на 15 постов хватает |

## File Structure

```
08_instagram/
  feed-data.js              единственный источник правды по ленте (данные)
  build_feed.js             CLI: --check | --id <id> | --all
  lib/
    paths.js                корни репозитория и каталоги
    sources.js              загрузка catalog.js и promo-data.js
    facts.js                резолв ссылок на источники, сверка фактов
    feed-schema.js          валидация постов и ритма 2+1
    render-card.js          HTML-шаблон → PNG через headless Chrome
    render-video.js         mp4 → кроп нужного формата, обложка
  templates/
    card.css                общие стили карточек
    cover.html figure.html era.html spec.html end.html
  test/
    sources.test.js facts.test.js feed-schema.test.js
    render-card.test.js render-video.test.js build-feed.test.js
  out/                      результат сборки (в .gitignore)
  index.html                борд (расширяем существующий макет)
  board.js                  логика борда: сетка, фильтры, статусы
  README.md                 как пользоваться конвейером
```

---

### Task 1: Загрузка данных каталога

**Files:**
- Create: `08_instagram/lib/paths.js`
- Create: `08_instagram/lib/sources.js`
- Test: `08_instagram/test/sources.test.js`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `paths.js` → `{ REPO, IMG_DIR, OUT_DIR, TEMPLATES_DIR, FONTS_CSS }` — все абсолютные строки
  - `sources.js` → `loadSources()` → `{ catalog: Array, promo: Object }`; `findExhibit(sources, slug)` → объект или `null`; `findPromo(sources, id)` → объект или `null`

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/sources.test.js`:

```js
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
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/sources.test.js`
Expected: FAIL — `Cannot find module '../lib/sources.js'`

- [ ] **Step 3: Написать `lib/paths.js`**

```js
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

module.exports = {
  REPO,
  IMG_DIR: path.join(REPO, 'shared', 'img'),
  FONTS_CSS: path.join(REPO, 'shared', 'fonts.css'),
  TEMPLATES_DIR: path.join(REPO, '08_instagram', 'templates'),
  OUT_DIR: path.join(REPO, '08_instagram', 'out'),
};
```

- [ ] **Step 4: Написать `lib/sources.js`**

`catalog.js` и `promo-data.js` — браузерные файлы, они пишут в `window`. Подставляем `global.window`, сбрасываем кэш `require`, потом возвращаем `window` на место.

```js
const path = require('path');
const { REPO } = require('./paths.js');

const CATALOG_FILE = path.join(REPO, 'shared', 'catalog.js');
const PROMO_FILE = path.join(REPO, '16_product_promos', 'promo-data.js');

function loadSources() {
  const prevWindow = global.window;
  global.window = {};
  try {
    for (const file of [CATALOG_FILE, PROMO_FILE]) {
      delete require.cache[require.resolve(file)];
      require(file);
    }
    const catalog = global.window.RELICTUM_CATALOG;
    const promo = global.window.RELICTUM_PROMO;
    if (!Array.isArray(catalog)) throw new Error('shared/catalog.js не отдал RELICTUM_CATALOG');
    if (!promo || typeof promo !== 'object') throw new Error('promo-data.js не отдал RELICTUM_PROMO');
    return { catalog, promo };
  } finally {
    global.window = prevWindow;
  }
}

function findExhibit(sources, slug) {
  return sources.catalog.find((o) => o.slug === slug) || null;
}

function findPromo(sources, id) {
  return Object.prototype.hasOwnProperty.call(sources.promo, id) ? sources.promo[id] : null;
}

module.exports = { loadSources, findExhibit, findPromo };
```

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/sources.test.js`
Expected: PASS, 4 теста

- [ ] **Step 6: Коммит**

```bash
git add 08_instagram/lib/paths.js 08_instagram/lib/sources.js 08_instagram/test/sources.test.js
git commit -m "feat(instagram): загрузка каталога и промо-данных"
```

---

### Task 2: Резолв источников и сверка фактов

**Files:**
- Create: `08_instagram/lib/facts.js`
- Test: `08_instagram/test/facts.test.js`

**Interfaces:**
- Consumes: `sources.js` → `findExhibit`, `findPromo`
- Produces:
  - `resolveSource(sources, ref)` → `{ ok: boolean, value: string|null, reason: string|null }`
  - `checkFact(sources, fact)` → `{ ok, reason, actual }`
  - `checkPostFacts(sources, post)` → `{ ok, problems: string[] }`

Формат ссылки: `<файл>:<ключ>.<путь.к.полю>`, например `catalog.js:megalodon-tooth.age` или `promo-data.js:R–0609.era.text`.

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/facts.test.js`:

```js
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
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/facts.test.js`
Expected: FAIL — `Cannot find module '../lib/facts.js'`

- [ ] **Step 3: Написать `lib/facts.js`**

```js
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
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/facts.test.js`
Expected: PASS, 9 тестов

- [ ] **Step 5: Коммит**

```bash
git add 08_instagram/lib/facts.js 08_instagram/test/facts.test.js
git commit -m "feat(instagram): сверка фактов с паспортами экспонатов"
```

---

### Task 3: Схема ленты и ритм 2+1

**Files:**
- Create: `08_instagram/lib/feed-schema.js`
- Test: `08_instagram/test/feed-schema.test.js`

**Interfaces:**
- Consumes: `sources.js` → `findExhibit`; `facts.js` → `checkPostFacts`; `paths.js` → `IMG_DIR`
- Produces:
  - `RUBRICS` — массив `['object','figure','era','interior','expedition','ritual','editions']`
  - `TEMPLATES` — массив `['cover','figure','era','spec','end']`
  - `validatePost(sources, post)` → `{ ok, problems: string[] }`
  - `checkRhythm(feed)` → `{ ok, problems: string[] }`
  - `validateFeed(sources, feed)` → `{ ok, posts: [{ id, ok, problems }], problems: string[] }`

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/feed-schema.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { loadSources } = require('../lib/sources.js');
const { validatePost, checkRhythm, validateFeed, RUBRICS } = require('../lib/feed-schema.js');

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
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/feed-schema.test.js`
Expected: FAIL — `Cannot find module '../lib/feed-schema.js'`

- [ ] **Step 3: Написать `lib/feed-schema.js`**

```js
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

  problems.push(...checkPostFacts(sources, post).problems);

  return { ok: problems.length === 0, problems };
}

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
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/feed-schema.test.js`
Expected: PASS, 10 тестов

- [ ] **Step 5: Коммит**

```bash
git add 08_instagram/lib/feed-schema.js 08_instagram/test/feed-schema.test.js
git commit -m "feat(instagram): схема ленты и проверка ритма 2+1"
```

---

### Task 4: Шаблоны карточек и рендер в PNG

**Files:**
- Create: `08_instagram/templates/card.css`
- Create: `08_instagram/templates/cover.html`, `figure.html`, `era.html`, `spec.html`, `end.html`
- Create: `08_instagram/lib/render-card.js`
- Test: `08_instagram/test/render-card.test.js`

**Interfaces:**
- Consumes: `paths.js` → `TEMPLATES_DIR`, `FONTS_CSS`, `OUT_DIR`
- Produces: `renderCard({ tpl, data, out, width, height })` → `Promise<{ path, width, height }>`; `readPngSize(buffer)` → `{ width, height }`

Шаблон содержит маркер `<!--CARD_DATA-->`; рендерер подменяет его на `<script>window.CARD_DATA = {...}</script>`, инлайновый скрипт шаблона раскладывает данные по DOM.

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/render-card.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { renderCard, readPngSize } = require('../lib/render-card.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-card-'));

test('readPngSize читает размеры из заголовка', () => {
  const buf = Buffer.alloc(24);
  buf.write('\x89PNG', 0, 'binary');
  buf.writeUInt32BE(1080, 16);
  buf.writeUInt32BE(1350, 20);
  assert.deepEqual(readPngSize(buf), { width: 1080, height: 1350 });
});

test('renderCard рисует карточку «Цифра» 1080x1350', async () => {
  const out = path.join(tmp, 'figure.png');
  const r = await renderCard({
    tpl: 'figure',
    data: { big: '≈ 23 млн лет', sub: 'миоцен', name: 'Зуб мегалодона' },
    out,
  });
  assert.equal(r.width, 1080);
  assert.equal(r.height, 1350);
  assert.ok(fs.statSync(out).size > 10000, 'PNG подозрительно маленький');
});

test('renderCard умеет квадрат', async () => {
  const out = path.join(tmp, 'end.png');
  const r = await renderCard({ tpl: 'end', data: {}, out, width: 1080, height: 1080 });
  assert.equal(r.height, 1080);
});

test('renderCard падает на неизвестном шаблоне', async () => {
  await assert.rejects(
    () => renderCard({ tpl: 'выдумка', data: {}, out: path.join(tmp, 'x.png') }),
    /шаблон/
  );
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/render-card.test.js`
Expected: FAIL — `Cannot find module '../lib/render-card.js'`

- [ ] **Step 3: Написать `templates/card.css`**

```css
/* Карточки постов — на дизайн-токенах сайта. Шрифты подключает сам шаблон. */
:root {
  --ivory: #F4F0E8;
  --bone: #FBF8F1;
  --black: #111111;
  --bronze: #B08A55;
  --deep: #9A6D34;
  --stone: #7A7267;
  --line: rgba(154, 109, 52, .28);
  --serif: 'Cormorant Garamond', serif;
  --sans: 'Inter', sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body {
  background: var(--ivory);
  color: var(--black);
  font-family: var(--sans);
  font-weight: 300;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 96px 84px;
}
.kicker {
  font-size: 24px; font-weight: 500; letter-spacing: .24em;
  text-transform: uppercase; color: var(--deep);
}
.title { font-family: var(--serif); font-weight: 300; font-size: 104px; line-height: 1.04; margin-top: 28px; }
.big { font-family: var(--serif); font-weight: 300; font-size: 168px; line-height: 1; }
.sub { font-size: 30px; color: var(--stone); margin-top: 24px; line-height: 1.5; }
.rule { height: 1px; background: var(--line); margin: 44px 0; }
.spec { font-size: 30px; line-height: 2.05; }
.spec b { font-weight: 500; color: var(--deep); font-size: 22px; letter-spacing: .16em; text-transform: uppercase; }
.foot { margin-top: auto; font-size: 24px; letter-spacing: .2em; text-transform: uppercase; color: var(--stone); }
.center { align-items: center; text-align: center; justify-content: center; }
```

- [ ] **Step 4: Написать пять шаблонов**

`08_instagram/templates/figure.html` — рубрика «Цифра»:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="../../shared/fonts.css">
<link rel="stylesheet" href="card.css">
</head>
<body>
  <div class="kicker" id="kicker"></div>
  <div class="big" id="big"></div>
  <div class="rule"></div>
  <div class="sub" id="sub"></div>
  <div class="foot">RELICTUM</div>
<!--CARD_DATA-->
<script>
  var d = window.CARD_DATA || {};
  document.getElementById('kicker').textContent = d.name || '';
  document.getElementById('big').textContent = d.big || '';
  document.getElementById('sub').textContent = d.sub || '';
</script>
</body>
</html>
```

`08_instagram/templates/cover.html` — обложка карусели:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="../../shared/fonts.css">
<link rel="stylesheet" href="card.css">
</head>
<body>
  <div class="kicker" id="kicker"></div>
  <div class="title" id="title"></div>
  <div class="rule"></div>
  <div class="sub" id="sub"></div>
  <div class="foot">RELICTUM</div>
<!--CARD_DATA-->
<script>
  var d = window.CARD_DATA || {};
  document.getElementById('kicker').textContent = d.kicker || '';
  document.getElementById('title').textContent = d.title || '';
  document.getElementById('sub').textContent = d.sub || '';
</script>
</body>
</html>
```

`08_instagram/templates/era.html` — карточка эпохи:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="../../shared/fonts.css">
<link rel="stylesheet" href="card.css">
</head>
<body class="center">
  <div class="kicker" id="kicker"></div>
  <div class="big" id="when"></div>
  <div class="rule" style="width:220px"></div>
  <div class="sub" id="fact" style="max-width:760px"></div>
<!--CARD_DATA-->
<script>
  var d = window.CARD_DATA || {};
  document.getElementById('kicker').textContent = d.era || '';
  document.getElementById('when').textContent = d.when || '';
  document.getElementById('fact').textContent = d.fact || '';
</script>
</body>
</html>
```

`08_instagram/templates/spec.html` — паспорт экспоната:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="../../shared/fonts.css">
<link rel="stylesheet" href="card.css">
</head>
<body>
  <div class="kicker">Паспорт объекта</div>
  <div class="title" id="name"></div>
  <div class="rule"></div>
  <div class="spec" id="rows"></div>
  <div class="foot">RELICTUM</div>
<!--CARD_DATA-->
<script>
  var d = window.CARD_DATA || {};
  document.getElementById('name').textContent = d.name || '';
  var rows = d.rows || [];
  document.getElementById('rows').innerHTML = rows
    .map(function (r) { return '<div><b>' + r[0] + '</b><br>' + r[1] + '</div>'; })
    .join('');
</script>
</body>
</html>
```

`08_instagram/templates/end.html` — финальная карточка:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="../../shared/fonts.css">
<link rel="stylesheet" href="card.css">
</head>
<body class="center">
  <div class="title" style="font-size:76px">RELICTUM</div>
  <div class="rule" style="width:180px"></div>
  <div class="sub" id="line">Стоимость и наличие — по запросу в галерею</div>
<!--CARD_DATA-->
<script>
  var d = window.CARD_DATA || {};
  if (d.line) document.getElementById('line').textContent = d.line;
</script>
</body>
</html>
```

- [ ] **Step 5: Написать `lib/render-card.js`**

Про флаги Chrome: `--virtual-time-budget` заставляет дождаться загрузки woff2 (без него шрифт может не успеть), `--allow-file-access-from-files` нужен для `file://` на CSS соседних каталогов. Успех определяется по строке `written to file` в stderr — прочий шум Chrome безвреден.

```js
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { TEMPLATES_DIR } = require('./paths.js');

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function readPngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89) throw new Error('это не PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function runChrome(args) {
  return new Promise((resolve, reject) => {
    execFile(CHROME, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      if (/written to file/.test(output)) return resolve(output);
      reject(new Error(`Chrome не сделал снимок:\n${output}`));
    });
  });
}

async function renderCard({ tpl, data, out, width = 1080, height = 1350 }) {
  const tplFile = path.join(TEMPLATES_DIR, `${tpl}.html`);
  if (!fs.existsSync(tplFile)) throw new Error(`нет такого шаблона: ${tpl}`);

  const html = fs.readFileSync(tplFile, 'utf8');
  if (!html.includes('<!--CARD_DATA-->')) {
    throw new Error(`в шаблоне ${tpl} нет маркера <!--CARD_DATA-->`);
  }
  const injected = html.replace(
    '<!--CARD_DATA-->',
    `<script>window.CARD_DATA = ${JSON.stringify(data || {})};</script>`
  );

  // временный файл кладём рядом с шаблонами, чтобы относительные пути к CSS работали
  const tmpFile = path.join(TEMPLATES_DIR, `.tmp-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, injected, 'utf8');
  fs.mkdirSync(path.dirname(out), { recursive: true });

  try {
    await runChrome([
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=8000',
      '--allow-file-access-from-files',
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      `file://${tmpFile}`,
    ]);
  } finally {
    fs.unlinkSync(tmpFile);
  }

  const size = readPngSize(fs.readFileSync(out));
  if (size.width !== width || size.height !== height) {
    throw new Error(`ожидали ${width}x${height}, получили ${size.width}x${size.height}`);
  }
  return { path: out, ...size };
}

module.exports = { renderCard, readPngSize };
```

- [ ] **Step 6: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/render-card.test.js`
Expected: PASS, 4 теста

- [ ] **Step 7: Посмотреть карточку глазами**

Отрендерить образец и открыть его — шрифты должны быть Cormorant Garamond и Inter, фон ivory, кириллица целая:

```bash
cd ~/relictum-vashikmart && node -e "
require('./08_instagram/lib/render-card.js').renderCard({
  tpl:'figure',
  data:{ name:'Зуб мегалодона', big:'≈ 23 млн лет', sub:'Миоцен. Мировой океан.' },
  out:'/tmp/relictum-card-check.png'
}).then(r=>console.log('готово', r))"
```

Открыть `/tmp/relictum-card-check.png` и убедиться: засечный шрифт у крупной цифры, разрядка у кикера, бронзовый цвет кикера. Если шрифт похож на системный — поднять `--virtual-time-budget`.

- [ ] **Step 8: Коммит**

```bash
git add 08_instagram/templates 08_instagram/lib/render-card.js 08_instagram/test/render-card.test.js
git commit -m "feat(instagram): шаблоны карточек и рендер в PNG через headless Chrome"
```

---

### Task 5: Нарезка видео и обложки

**Files:**
- Create: `08_instagram/lib/render-video.js`
- Test: `08_instagram/test/render-video.test.js`

**Interfaces:**
- Consumes: `paths.js` → `IMG_DIR`
- Produces:
  - `probeVideo(file)` → `{ width, height, duration, hasAudio }`
  - `renderVideo({ src, crop, out, trim })` → `Promise<{ path, width, height }>`
  - `renderPhoto({ src, crop, out })` → `Promise<{ path, width, height }>`
  - `extractCover({ src, at, out })` → `Promise<{ path }>`

Кроп только центральный: подложки отклонены (размытая даёт призрак объекта, заливка — видимый шов).

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/render-video.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { IMG_DIR } = require('../lib/paths.js');
const { probeVideo, renderVideo, renderPhoto, extractCover } = require('../lib/render-video.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-video-'));
const SPIN = path.join(IMG_DIR, 'spin_megalodon.mp4');

test('probeVideo читает размеры и наличие звука', () => {
  const p = probeVideo(SPIN);
  assert.ok(p.width > p.height, 'спины горизонтальные');
  assert.equal(p.hasAudio, true);
  assert.ok(p.duration > 4);
});

test('renderVideo делает 4:5', async () => {
  const out = path.join(tmp, 'v45.mp4');
  const r = await renderVideo({ src: 'spin_megalodon.mp4', crop: '4:5', out });
  assert.equal(r.width, 1080);
  assert.equal(r.height, 1350);
});

test('renderVideo делает 1:1', async () => {
  const out = path.join(tmp, 'v11.mp4');
  const r = await renderVideo({ src: 'spin_megalodon.mp4', crop: '1:1', out });
  assert.equal(r.width, 1080);
  assert.equal(r.height, 1080);
});

test('renderVideo режет по trim', async () => {
  const out = path.join(tmp, 'vtrim.mp4');
  await renderVideo({ src: 'spin_megalodon.mp4', crop: '1:1', out, trim: [1, 2] });
  assert.ok(probeVideo(out).duration < 2.6);
});

test('renderVideo отклоняет неизвестный кроп', async () => {
  await assert.rejects(
    () => renderVideo({ src: 'spin_megalodon.mp4', crop: '16:9', out: path.join(tmp, 'x.mp4') }),
    /кроп/
  );
});

test('renderPhoto делает 4:5 из jpg', async () => {
  const out = path.join(tmp, 'p45.jpg');
  const r = await renderPhoto({ src: 'int_ph_megalodon.jpg', crop: '4:5', out });
  assert.equal(r.width, 1080);
  assert.equal(r.height, 1350);
});

test('extractCover вытаскивает кадр', async () => {
  const out = path.join(tmp, 'cover.jpg');
  await extractCover({ src: path.join(tmp, 'v45.mp4'), at: 2.0, out });
  assert.ok(fs.statSync(out).size > 5000);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/render-video.test.js`
Expected: FAIL — `Cannot find module '../lib/render-video.js'`

- [ ] **Step 3: Написать `lib/render-video.js`**

```js
const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const { IMG_DIR } = require('./paths.js');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Центральный кроп. Подложки отклонены: размытая даёт призрак объекта,
// заливка цветом — видимый шов (фон исходников неоднороден).
const CROPS = {
  '4:5': { filter: 'crop=ih*4/5:ih,scale=1080:1350:flags=lanczos', width: 1080, height: 1350 },
  '1:1': { filter: 'crop=ih:ih,scale=1080:1080:flags=lanczos', width: 1080, height: 1080 },
};

function resolveSrc(src) {
  const file = path.isAbsolute(src) ? src : path.join(IMG_DIR, src);
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  return file;
}

function probeVideo(file) {
  const v = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim().split('\n');
  const a = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'a',
    '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file,
  ]).toString().trim();
  return {
    width: Number(v[0]),
    height: Number(v[1]),
    duration: Number(v[2]),
    hasAudio: a.length > 0,
  };
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg упал:\n${stderr}`));
      resolve(stderr);
    });
  });
}

async function renderVideo({ src, crop = '4:5', out, trim = null }) {
  const spec = CROPS[crop];
  if (!spec) throw new Error(`неизвестный кроп «${crop}», доступны ${Object.keys(CROPS).join(', ')}`);
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const args = ['-y', '-v', 'error'];
  if (trim) args.push('-ss', String(trim[0]));
  args.push('-i', file);
  if (trim) args.push('-t', String(trim[1]));

  const hasAudio = probeVideo(file).hasAudio;
  if (!hasAudio) {
    // Reels без аудиодорожки не принимаются — подмешиваем тишину
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest');
  }
  args.push('-vf', spec.filter, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);

  await run(args);
  const got = probeVideo(out);
  if (got.width !== spec.width || got.height !== spec.height) {
    throw new Error(`ожидали ${spec.width}x${spec.height}, получили ${got.width}x${got.height}`);
  }
  return { path: out, width: got.width, height: got.height };
}

async function renderPhoto({ src, crop = '4:5', out }) {
  const spec = CROPS[crop];
  if (!spec) throw new Error(`неизвестный кроп «${crop}»`);
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run(['-y', '-v', 'error', '-i', file, '-vf', spec.filter, '-q:v', '2', out]);
  const got = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out,
  ]).toString().trim().split(',');
  return { path: out, width: Number(got[0]), height: Number(got[1]) };
}

async function extractCover({ src, at = 2.5, out }) {
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run(['-y', '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '2', out]);
  return { path: out };
}

module.exports = { probeVideo, renderVideo, renderPhoto, extractCover, CROPS };
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/render-video.test.js`
Expected: PASS, 7 тестов

- [ ] **Step 5: Коммит**

```bash
git add 08_instagram/lib/render-video.js 08_instagram/test/render-video.test.js
git commit -m "feat(instagram): нарезка видео и фото под форматы Instagram"
```

---

### Task 6: Данные ленты — 15 постов

**Files:**
- Create: `08_instagram/feed-data.js`
- Modify: `08_instagram/test/feed-schema.test.js` (добавить проверку реальной ленты)

**Interfaces:**
- Consumes: `feed-schema.js` → `validateFeed`
- Produces: `window.RELICTUM_FEED` — массив из 15 постов; в Node читается тем же приёмом, что и `catalog.js`

**Как выбирать экспонаты:** брать только из 36 позиций с полным набором (`spin` + `interior` + `gallery` ≥ 4). Список получить командой:

```bash
cd ~/relictum-vashikmart && node -e "
global.window={}; require('./shared/catalog.js'); require('./16_product_promos/promo-data.js');
const c=window.RELICTUM_CATALOG, p=window.RELICTUM_PROMO;
c.filter(o=>{const x=p[o.id]; return x&&x.spin&&x.interior&&x.gallery&&x.gallery.length>=4;})
 .forEach(o=>console.log(o.id, o.slug, '|', o.age));"
```

**Раскладка на месяц:** 15 слотов, 5 троек, в каждой ровно один товарный пост. Рубрики по частоте из спеки: `object` ×4, `figure` ×4, `era` ×4, `interior` ×2, `ritual` ×1.

- [ ] **Step 1: Написать падающий тест на реальную ленту**

Дописать в конец `08_instagram/test/feed-schema.test.js`:

```js
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
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/feed-schema.test.js`
Expected: FAIL — `Cannot find module '../feed-data.js'`

- [ ] **Step 3: Написать `feed-data.js`**

Ниже первые три поста — эталон структуры для всех пятнадцати. Остальные двенадцать писать по этому же образцу, подставляя экспонаты из списка Шага «Как выбирать экспонаты» и сверяя каждое число с паспортом. **Тексты пока черновые** — их перепишет субагент в Задаче 8; здесь важно, чтобы структура прошла валидатор.

```js
/* Лента Instagram @relictum — единственный источник правды.
   Правится руками; всё остальное производное.
   Ритм 2+1: в каждой тройке слотов ровно один товарный пост (exhibit != null).
   Каждое число в facts обязано сверяться с паспортом: catalog.js по slug,
   promo-data.js по id вида R–0609. Не сверено — не публикуется. */
window.RELICTUM_FEED = [
  {
    id: 'p01',
    date: '2026-08-18',
    rubric: 'era',
    slot: 1,
    exhibit: null,
    format: 'carousel',
    frames: [
      { type: 'video', src: 'era_mammoth.mp4', crop: '4:5' },
      { type: 'card', tpl: 'era', data: { era: 'Плейстоцен', when: '2,6 млн — 11,7 тыс лет назад', fact: 'Мамонтовая степь тянулась от Испании до Юкона.' } },
      { type: 'card', tpl: 'end', data: {} },
    ],
    caption: { lead: 'Плейстоцен', body: 'Эпоха, в которой мамонтовая степь была самым обширным биомом планеты.', cta: '' },
    tags: ['#relictum', '#палеонтология', '#плейстоцен'],
    facts: [],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p02',
    date: '2026-08-20',
    rubric: 'figure',
    slot: 2,
    exhibit: null,
    format: 'single',
    frames: [
      { type: 'card', tpl: 'figure', data: { name: 'Сеймчан', big: '≈ 4,56 млрд лет', sub: 'Возраст вещества палласита — старше Земли.' } },
    ],
    caption: { lead: '4,56 миллиарда лет', body: 'Столько вещество палласита существует до того, как попасть в витрину.', cta: '' },
    tags: ['#relictum', '#метеорит'],
    facts: [
      { claim: 'возраст', value: '≈ 4,56 млрд лет', source: 'catalog.js:seymchan-pallasite.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p03',
    date: '2026-08-22',
    rubric: 'object',
    slot: 3,
    exhibit: 'megalodon-tooth',
    format: 'carousel',
    frames: [
      { type: 'video', src: 'spin_megalodon.mp4', crop: '4:5' },
      { type: 'photo', src: 'int_ph_megalodon.jpg', crop: '4:5' },
      { type: 'card', tpl: 'spec', data: { name: 'Зуб мегалодона', rows: [['Возраст', '≈ 23 млн лет, миоцен'], ['Оформление', 'На опоре из чернёной стали']] } },
      { type: 'card', tpl: 'end', data: {} },
    ],
    caption: { lead: 'Зуб мегалодона', body: 'Эмаль сохранила цвет породы, в которой зуб пролежал миоцен целиком.', cta: 'Стоимость и наличие — по запросу в галерею.' },
    tags: ['#relictum', '#мегалодон'],
    facts: [
      { claim: 'возраст', value: '≈ 23 млн лет, миоцен', source: 'catalog.js:megalodon-tooth.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  // p04…p15 — по тому же образцу, слоты 4…15, в каждой тройке ровно один товарный
];
```

- [ ] **Step 4: Прогнать валидатор и починить всё, на что он ругается**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/feed-schema.test.js`
Expected: PASS. Пока падает — читать текст ошибки: он называет пост, поле и причину. Частые случаи: значение факта не совпало с паспортом (исправлять значение, а не паспорт), в тройке два товарных поста, файла нет в `shared/img`.

- [ ] **Step 5: Коммит**

```bash
git add 08_instagram/feed-data.js 08_instagram/test/feed-schema.test.js
git commit -m "feat(instagram): лента на месяц, 15 постов"
```

---

### Task 7: CLI сборки

**Files:**
- Create: `08_instagram/build_feed.js`
- Test: `08_instagram/test/build-feed.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `sources.js`, `feed-schema.js`, `render-card.js`, `render-video.js`, `paths.js`
- Produces:
  - `loadFeed()` → массив постов
  - `outDirFor(post)` → строка вида `out/2026-08-22_object_megalodon-tooth`
  - `buildPost(sources, post)` → `Promise<{ dir, files: string[] }>`
  - `main(argv)` → `Promise<number>` (код возврата)

Раскладка папки: кадры `01.<ext>`, `02.<ext>` … в порядке листания, плюс `caption.txt` и `meta.json`.

- [ ] **Step 1: Написать падающий тест**

Создать `08_instagram/test/build-feed.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadSources } = require('../lib/sources.js');
const { loadFeed, outDirFor, buildPost } = require('../build_feed.js');

test('loadFeed отдаёт 15 постов', () => {
  assert.equal(loadFeed().length, 15);
});

test('outDirFor складывает дату, рубрику и экспонат', () => {
  const d = outDirFor({ date: '2026-08-22', rubric: 'object', exhibit: 'megalodon-tooth' });
  assert.match(d, /2026-08-22_object_megalodon-tooth$/);
});

test('outDirFor без экспоната берёт id поста', () => {
  const d = outDirFor({ date: '2026-08-18', rubric: 'era', exhibit: null, id: 'p01' });
  assert.match(d, /2026-08-18_era_p01$/);
});

test('buildPost собирает кадры по порядку и подпись', async () => {
  const s = loadSources();
  const post = loadFeed().find((p) => p.id === 'p03');
  const r = await buildPost(s, post);
  assert.ok(fs.existsSync(path.join(r.dir, 'caption.txt')));
  assert.ok(fs.existsSync(path.join(r.dir, 'meta.json')));
  assert.equal(r.files.length, post.frames.length);
  assert.match(r.files[0], /^01\./);
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  assert.equal(meta.id, 'p03');
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/build-feed.test.js`
Expected: FAIL — `Cannot find module '../build_feed.js'`

- [ ] **Step 3: Написать `build_feed.js`**

```js
#!/usr/bin/env node
/* Сборка постов Instagram из feed-data.js и снятых ассетов.
   Ничего не генерирует моделями — работает при нулевом балансе Higgsfield.

   node 08_instagram/build_feed.js --check      только проверка, ничего не пишет
   node 08_instagram/build_feed.js --id p03     собрать один пост
   node 08_instagram/build_feed.js --all        собрать все посты со статусом ready
*/
const fs = require('fs');
const path = require('path');
const { OUT_DIR, REPO } = require('./lib/paths.js');
const { loadSources } = require('./lib/sources.js');
const { validateFeed } = require('./lib/feed-schema.js');
const { renderCard } = require('./lib/render-card.js');
const { renderVideo, renderPhoto, extractCover } = require('./lib/render-video.js');

const FEED_FILE = path.join(REPO, '08_instagram', 'feed-data.js');

function loadFeed() {
  const prev = global.window;
  global.window = {};
  try {
    delete require.cache[require.resolve(FEED_FILE)];
    require(FEED_FILE);
    const feed = global.window.RELICTUM_FEED;
    if (!Array.isArray(feed)) throw new Error('feed-data.js не отдал RELICTUM_FEED');
    return feed;
  } finally {
    global.window = prev;
  }
}

function outDirFor(post) {
  const tail = post.exhibit || post.id;
  return path.join(OUT_DIR, `${post.date}_${post.rubric}_${tail}`);
}

function captionText(post) {
  const c = post.caption || {};
  return [c.lead, c.body, c.cta, (post.tags || []).join(' ')]
    .filter((s) => s && String(s).trim())
    .join('\n\n') + '\n';
}

async function buildPost(sources, post) {
  const dir = outDirFor(post);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const files = [];
  for (let i = 0; i < post.frames.length; i++) {
    const f = post.frames[i];
    const n = String(i + 1).padStart(2, '0');
    const crop = f.crop || (post.format === 'single' ? '1:1' : '4:5');

    if (f.type === 'video') {
      const out = path.join(dir, `${n}.mp4`);
      await renderVideo({ src: f.src, crop, out, trim: f.trim || null });
      await extractCover({ src: out, at: 2.0, out: path.join(dir, `${n}_cover.jpg`) });
      files.push(`${n}.mp4`);
    } else if (f.type === 'photo') {
      const out = path.join(dir, `${n}.jpg`);
      await renderPhoto({ src: f.src, crop, out });
      files.push(`${n}.jpg`);
    } else {
      const out = path.join(dir, `${n}.png`);
      const height = crop === '1:1' ? 1080 : 1350;
      await renderCard({ tpl: f.tpl, data: f.data || {}, out, width: 1080, height });
      files.push(`${n}.png`);
    }
  }

  fs.writeFileSync(path.join(dir, 'caption.txt'), captionText(post), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ id: post.id, date: post.date, rubric: post.rubric, exhibit: post.exhibit, slot: post.slot, format: post.format, files }, null, 2),
    'utf8'
  );
  return { dir, files };
}

function report(result) {
  for (const p of result.posts) {
    if (!p.ok) for (const problem of p.problems) console.error(`  ✗ ${problem}`);
  }
  for (const problem of result.problems) console.error(`  ✗ ${problem}`);
}

async function main(argv) {
  const sources = loadSources();
  const feed = loadFeed();
  const result = validateFeed(sources, feed);

  if (argv.includes('--check')) {
    if (result.ok) {
      console.log(`✓ лента цела: ${feed.length} постов, ритм 2+1 соблюдён, все факты сверены`);
      return 0;
    }
    console.error('Лента не прошла проверку:');
    report(result);
    return 1;
  }

  if (!result.ok) {
    console.error('Сборка остановлена — сначала почините ленту (--check):');
    report(result);
    return 1;
  }

  const idIndex = argv.indexOf('--id');
  let targets;
  if (idIndex !== -1) {
    const id = argv[idIndex + 1];
    targets = feed.filter((p) => p.id === id);
    if (targets.length === 0) {
      console.error(`Нет поста с id «${id}»`);
      return 1;
    }
  } else if (argv.includes('--all')) {
    targets = feed.filter((p) => p.status === 'ready');
  } else {
    console.error('Укажите --check, --id <id> или --all');
    return 1;
  }

  for (const post of targets) {
    const r = await buildPost(sources, post);
    console.log(`✓ ${post.id} → ${path.relative(REPO, r.dir)} (${r.files.length} кадров)`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { loadFeed, outDirFor, buildPost, main };
```

- [ ] **Step 4: Добавить `out/` в `.gitignore`**

Дописать в конец `.gitignore`:

```
# собранные посты Instagram — пересобираются из feed-data.js
08_instagram/out/
```

- [ ] **Step 5: Запустить тест — должен пройти**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/build-feed.test.js`
Expected: PASS, 4 теста

- [ ] **Step 6: Прогнать проверку и полную сборку**

```bash
cd ~/relictum-vashikmart && node 08_instagram/build_feed.js --check && node 08_instagram/build_feed.js --all
```

Expected: сначала `✓ лента цела: 15 постов…`, затем 15 строк вида `✓ p01 → 08_instagram/out/…`. Открыть две-три папки и посмотреть кадры глазами.

- [ ] **Step 7: Коммит**

```bash
git add 08_instagram/build_feed.js 08_instagram/test/build-feed.test.js .gitignore
git commit -m "feat(instagram): CLI сборки постов"
```

---

### Task 8: Тексты по правилам дома

**Files:**
- Modify: `08_instagram/feed-data.js` (поля `caption` и `tags` всех 15 постов)

**Interfaces:**
- Consumes: `feed-data.js` — структура из Задачи 6
- Produces: тот же файл с переписанными подписями; структура не меняется

Черновые подписи из Задачи 6 заменяются на настоящие. Пишет субагент, главный агент проверяет и правит точечно.

- [ ] **Step 1: Собрать эталоны и факты**

Прочитать 5 описаний экспонатов из `shared/catalog.js` (поле `description`) — это эталон регистра. Для каждого поста выписать факты из паспорта.

- [ ] **Step 2: Дать субагенту задание**

Задание должно содержать: пять эталонных описаний, факты по каждому посту, список слотов с лимитами (`lead` ≤ 40 знаков, `body` ≤ 220, `cta` ≤ 60), и запреты. Ответ — строгий JSON вида `{ "p01": { "lead": "…", "body": "…", "cta": "…", "tags": ["…"] }, … }`.

Запреты передать дословно:

> Люксовый регистр: спокойно, достойно, короткие фразы. Без шуток, сленга, капса, восклицаний, обращения на «ты». Без буллет-пойнтов и списков. Формула подписи — одно из трёх: интересный факт о предмете, в чём особенность предмета, для какого интерьера. Не дублировать то, что видно на самой карточке. Цена только «по запросу в галерею», конкретных сумм нет. Тему подлинности не поднимать: слова «подлинный», «подлинность», «сертификат подлинности», «сертифицированный» запрещены. Запрещены слова «реликвия», «частное собрание», «под ключ», «собирательный экспонат», обороты вроде «снимок фиксирует». Имена и термины полностью, без сокращений. Факты не выдумывать — только из переданных.

- [ ] **Step 3: Подставить тексты и прогнать проверку**

Run: `cd ~/relictum-vashikmart && node 08_instagram/build_feed.js --check`
Expected: `✓ лента цела: 15 постов…`

- [ ] **Step 4: Проверить запреты грепом**

```bash
cd ~/relictum-vashikmart && grep -nEi "подлинн|сертифицир|реликви|частное собрание|под ключ" 08_instagram/feed-data.js || echo "✓ запрещённых слов нет"
```

Expected: `✓ запрещённых слов нет`

- [ ] **Step 5: Пересобрать и посмотреть глазами**

```bash
cd ~/relictum-vashikmart && node 08_instagram/build_feed.js --all
```

Открыть `caption.txt` в двух-трёх папках и прочитать — регистр должен совпадать с сайтом.

- [ ] **Step 6: Коммит**

```bash
git add 08_instagram/feed-data.js
git commit -m "feat(instagram): подписи постов по правилам дома"
```

---

### Task 9: Борд

**Files:**
- Modify: `08_instagram/index.html`
- Create: `08_instagram/board.js`

**Interfaces:**
- Consumes: `feed-data.js` → `window.RELICTUM_FEED`
- Produces: страница со статичным макетом (как было) плюс живая секция ленты

- [ ] **Step 1: Перевести страницу на локальные шрифты**

Заменить строку с Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
```

на:

```html
<link rel="stylesheet" href="../shared/fonts.css">
```

Проверить: `grep -c fonts.googleapis.com 08_instagram/index.html` должен дать `0`.

- [ ] **Step 2: Добавить разметку секции борда**

Перед закрывающим `</body>` вставить:

```html
<section class="wrap" id="board">
  <div class="label">Борд</div>
  <h2>Лента: сетка, календарь, статусы</h2>
  <p class="intro">Читается из <code>feed-data.js</code>. Ритм 2+1: в каждой тройке один товарный пост.</p>
  <div id="board-filters" style="margin:24px 0;display:flex;gap:10px;flex-wrap:wrap"></div>
  <div id="board-grid" class="grid" style="max-width:420px;margin:24px 0"></div>
  <table class="rub" id="board-table"></table>
</section>
<script src="feed-data.js"></script>
<script src="board.js"></script>
```

- [ ] **Step 3: Написать `08_instagram/board.js`**

```js
/* Борд ленты: сетка, фильтр по рубрикам, календарь со статусами.
   Данные — window.RELICTUM_FEED. Проверок здесь нет: они в build_feed.js --check. */
(function () {
  var feed = (window.RELICTUM_FEED || []).slice().sort(function (a, b) { return a.slot - b.slot; });
  var RUBRIC_RU = {
    object: 'Объект недели', figure: 'Цифра', era: 'Эпохи', interior: 'Интерьер',
    expedition: 'Экспедиции', ritual: 'Ритуал', editions: 'Editions'
  };
  var active = null;

  function shown() {
    return active ? feed.filter(function (p) { return p.rubric === active; }) : feed;
  }

  function firstVisual(post) {
    for (var i = 0; i < post.frames.length; i++) {
      var f = post.frames[i];
      if (f.type === 'photo') return '../shared/img/' + f.src;
      if (f.type === 'video') return null;
    }
    return null;
  }

  function drawGrid() {
    var grid = document.getElementById('board-grid');
    grid.innerHTML = shown().map(function (p) {
      var img = firstVisual(p);
      var isGood = p.exhibit !== null && p.exhibit !== undefined;
      if (img) return '<div class="tile"><img src="' + img + '" alt=""></div>';
      return '<div class="tile quote' + (isGood ? '' : ' light') + '"><div><div class="q">'
        + (p.caption && p.caption.lead ? p.caption.lead : p.id)
        + '</div><div class="s">' + (RUBRIC_RU[p.rubric] || p.rubric) + '</div></div></div>';
    }).join('');
  }

  function drawTable() {
    var rows = shown().map(function (p) {
      var mark = p.status === 'ready' ? '✓' : (p.status === 'blocked' ? '✗' : '·');
      var note = (p.blockers && p.blockers.length) ? p.blockers.join('; ') : '';
      return '<tr><td>' + p.slot + '</td><td>' + p.date + '</td><td>'
        + (RUBRIC_RU[p.rubric] || p.rubric) + '</td><td>'
        + (p.exhibit || '—') + '</td><td>' + mark + ' ' + p.status + '</td><td>' + note + '</td></tr>';
    }).join('');
    document.getElementById('board-table').innerHTML =
      '<tr><th>Слот</th><th>Дата</th><th>Рубрика</th><th>Экспонат</th><th>Статус</th><th>Что мешает</th></tr>' + rows;
  }

  function drawFilters() {
    var used = [];
    feed.forEach(function (p) { if (used.indexOf(p.rubric) === -1) used.push(p.rubric); });
    var box = document.getElementById('board-filters');
    box.innerHTML = ['<button data-r="">Все</button>']
      .concat(used.map(function (r) { return '<button data-r="' + r + '">' + (RUBRIC_RU[r] || r) + '</button>'; }))
      .join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.style.cssText = 'font:inherit;font-size:12px;letter-spacing:.14em;text-transform:uppercase;'
        + 'padding:9px 16px;border:1px solid var(--line);background:transparent;cursor:pointer;color:var(--deep)';
      b.onclick = function () { active = b.dataset.r || null; drawGrid(); drawTable(); };
    });
  }

  if (!feed.length) return;
  drawFilters(); drawGrid(); drawTable();
})();
```

- [ ] **Step 4: Проверить борд в браузере**

```bash
cd ~/relictum-vashikmart/08_instagram && python3 -m http.server 8099
```

Открыть `http://localhost:8099/index.html`, проскроллить до секции «Борд». Проверить: сетка из 15 плиток, ритм крестиком читается, фильтры переключают, таблица показывает слоты и статусы. Остановить сервер.

- [ ] **Step 5: Коммит**

```bash
git add 08_instagram/index.html 08_instagram/board.js
git commit -m "feat(instagram): борд ленты с сеткой, фильтрами и статусами"
```

---

### Task 10: Документация конвейера

**Files:**
- Create: `08_instagram/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Написать `08_instagram/README.md`**

```markdown
# Instagram-конвейер @relictum

Собирает готовые к постингу файлы из данных каталога и уже снятых ассетов.
Моделей не зовёт — работает при нулевом балансе Higgsfield.

## Команды

    node 08_instagram/build_feed.js --check     проверка ленты, ничего не пишет
    node 08_instagram/build_feed.js --id p03    собрать один пост
    node 08_instagram/build_feed.js --all       собрать все посты со статусом ready
    node --test 08_instagram/test/              прогнать тесты

Результат — `08_instagram/out/<дата>_<рубрика>_<экспонат>/`: кадры `01…NN`
в порядке листания, `caption.txt`, `meta.json`. Папка в `.gitignore`.

## Что где

| Файл | Роль |
|---|---|
| `feed-data.js` | единственный источник правды по ленте, правится руками |
| `lib/sources.js` | загрузка `shared/catalog.js` и `promo-data.js` |
| `lib/facts.js` | сверка чисел с паспортами |
| `lib/feed-schema.js` | валидация постов и ритма 2+1 |
| `lib/render-card.js` | HTML-шаблон → PNG через headless Chrome |
| `lib/render-video.js` | mp4/jpg → центральный кроп 4:5 или 1:1 |
| `board.js` | борд на странице `index.html` |

## Правила

- Ноль npm-зависимостей: только Node, Chrome и ffmpeg.
- Шрифты — `shared/fonts.css`, Google Fonts запрещены.
- `frames[].src` — имя файла в `shared/img`, не путь и не URL.
- Каждое число в `facts[]` обязано сверяться с паспортом. Не сверено — не публикуется.
- Кроп только центральный: подложки пробовали, размытая даёт призрак объекта,
  заливка цветом — видимый шов.
- `catalog.js` адресуется по `slug`, `promo-data.js` — по `id` вида `R–0609`.

## Добивка ассетов

Экспонатов без `spin` — 42, без `alive` — 43, без интерьера — 18. Генерация через
скилл `.claude/skills/relictum-product-promo/` (Higgsfield CLI локально либо MCP
из облачной сессии). Canvas в Higgsfield нет — проверено 14.08.2026.
```

- [ ] **Step 2: Дописать раздел в `CLAUDE.md`**

Вставить после раздела про печатный PDF-каталог:

```markdown
- **Instagram-конвейер (data-driven)**: данные `08_instagram/feed-data.js` → `build_feed.js`
  собирает готовые к постингу папки в `08_instagram/out/` (в `.gitignore`). Карточки —
  headless Chrome по шаблонам `08_instagram/templates/`, видео — ffmpeg центральным кропом.
  Моделей не зовёт. Проверка `--check` не пропускает несверенные факты. Подробности:
  `08_instagram/README.md`.
```

- [ ] **Step 3: Прогнать все тесты разом**

Run: `cd ~/relictum-vashikmart && node --test 08_instagram/test/`
Expected: PASS, все файлы тестов

- [ ] **Step 4: Коммит**

```bash
git add 08_instagram/README.md CLAUDE.md
git commit -m "docs(instagram): описание конвейера"
```

---

## Что остаётся за рамками плана

Осознанно не делаем — при необходимости отдельными задачами:

- **Автопостинг в Instagram** — не нужен и рискован.
- **Добивка ассетов** (42 спина, 43 `alive`, 18 интерьеров) — отдельная сессия через скилл `relictum-product-promo`, после пополнения кредитов Higgsfield (сейчас 2.37).
- **Пересборка PDF-каталога и прайс-XLSX** под выросшую коллекцию — они собраны на 37 экспонатов против 79 в каталоге.
- **Публикация борда** — push в `main` только по команде владельца.
