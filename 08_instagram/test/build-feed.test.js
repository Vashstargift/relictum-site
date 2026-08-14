const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadSources } = require('../lib/sources.js');
const { readPngSize } = require('../lib/render-card.js');
const { loadFeed, outDirFor, buildPost, buildAll, main } = require('../build_feed.js');

// main() пишет в консоль по ходу работы — в тестах, которые проверяют только
// код возврата/сообщения, глушим её, чтобы не засорять вывод прогона.
async function quiet(fn) {
  const origLog = console.log;
  const origError = console.error;
  const logs = [];
  const errors = [];
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const result = await fn();
    return { result, logs, errors };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

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

// Находка 1: обложка видео-кадра (NN_cover.jpg) реально лежит в папке, но
// в meta.json её не было — потребитель, ориентирующийся на список, либо не
// найдёт обложку, либо сочтёт её лишним файлом и удалит. meta.json.files
// должен перечислять РОВНО то, что лежит на диске, различая роль каждого
// файла (кадр листания / обложка к кадру), и порядок листания должен
// читаться однозначно (у обложки — order её кадра, но другая роль).
test('meta.json перечисляет все файлы папки, включая обложки видео-кадров, и различает их роль', async () => {
  const s = loadSources();
  const post = loadFeed().find((p) => p.id === 'p03'); // video, photo, spec-card, end-card
  const r = await buildPost(s, post);

  const actualFiles = fs.readdirSync(r.dir)
    .filter((f) => f !== 'caption.txt' && f !== 'meta.json')
    .sort();
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  const listedNames = meta.files.map((e) => e.name).sort();

  assert.deepEqual(listedNames, actualFiles, 'meta.json.files должен перечислять ровно то, что реально лежит в папке');

  const cover = meta.files.find((e) => e.name === '01_cover.jpg');
  assert.ok(cover, 'обложка видео-кадра должна попасть в список');
  assert.equal(cover.role, 'cover');

  const frame = meta.files.find((e) => e.name === '01.mp4');
  assert.ok(frame);
  assert.equal(frame.role, 'frame');

  // Общий order у обложки и её кадра, но разная роль — потребитель отличит
  // обложку от следующего кадра листания и не спутает порядок.
  assert.equal(cover.order, frame.order);

  const frameOrders = meta.files.filter((e) => e.role === 'frame').map((e) => e.order);
  assert.deepEqual(frameOrders, [1, 2, 3, 4], 'порядок листания по кадрам должен идти без пропусков и повторов');
});

// Находка 2: --all бросал всю сборку при падении одного поста — остальные
// молча не собирались. Проверяем на синтетической ленте (2 здоровых поста +
// 1 заведомо нерабочий), собранной во временном каталоге ОС, а не в
// feed-data.js — постоянно ломать реальную ленту незачем.
test('buildAll: падение одного поста не мешает собрать остальные, ошибка не теряется', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-broken-feed-'));
  const feedFile = path.join(tmp, 'broken-feed.js');
  fs.writeFileSync(feedFile, `
    window.RELICTUM_FEED = [
      { id: 'ok-1', date: '2026-01-01', rubric: 'object', slot: 1, exhibit: null, format: 'single',
        frames: [{ type: 'card', tpl: 'end', data: {} }],
        caption: { lead: 'ok1' }, tags: [], facts: [], status: 'ready', blockers: [] },
      { id: 'broken', date: '2026-01-02', rubric: 'object', slot: 2, exhibit: null, format: 'single',
        frames: [{ type: 'card', tpl: 'no-such-template', data: {} }],
        caption: { lead: 'x' }, tags: [], facts: [], status: 'ready', blockers: [] },
      { id: 'ok-2', date: '2026-01-03', rubric: 'object', slot: 3, exhibit: null, format: 'single',
        frames: [{ type: 'card', tpl: 'end', data: {} }],
        caption: { lead: 'ok2' }, tags: [], facts: [], status: 'ready', blockers: [] },
    ];
  `, 'utf8');

  const prevWindow = global.window;
  global.window = {};
  require(feedFile);
  const feed = global.window.RELICTUM_FEED;
  global.window = prevWindow;

  const s = loadSources();
  const { result: summary } = await quiet(() => buildAll(s, feed));

  assert.deepEqual(summary.built.sort(), ['ok-1', 'ok-2'], 'здоровые посты должны собраться несмотря на соседний брак');
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.failed[0].id, 'broken');
  assert.match(summary.failed[0].message, /no-such-template|такого шаблона/, 'причина падения должна быть названа');

  // Находка 3 заодно: недостроенная папка упавшего поста не должна остаться
  // на диске похожей на готовую.
  const brokenPost = feed.find((p) => p.id === 'broken');
  assert.equal(fs.existsSync(outDirFor(brokenPost)), false, 'папка упавшего поста должна быть удалена целиком');
});

// Находка 4: main() — контракт командной строки — не был покрыт тестами
// вообще. Проверяем быстрые ветки, не требующие сборки видео.
test('main(["--check"]) на здоровой ленте возвращает 0 и ничего не пишет на диск', async () => {
  const origWrite = fs.writeFileSync;
  const origMkdir = fs.mkdirSync;
  let writeCalls = 0;
  fs.writeFileSync = (...a) => { writeCalls++; return origWrite(...a); };
  fs.mkdirSync = (...a) => { writeCalls++; return origMkdir(...a); };

  let code;
  try {
    ({ result: code } = await quiet(() => main(['--check'])));
  } finally {
    fs.writeFileSync = origWrite;
    fs.mkdirSync = origMkdir;
  }

  assert.equal(code, 0);
  assert.equal(writeCalls, 0, '--check не должен ничего писать на диск');
});

test('main(["--id", "не-существует"]) возвращает ненулевой код', async () => {
  const { result: code } = await quiet(() => main(['--id', 'не-существует']));
  assert.notEqual(code, 0);
});

test('main([]) без аргументов возвращает ненулевой код', async () => {
  const { result: code } = await quiet(() => main([]));
  assert.notEqual(code, 0);
});

test('main(["--bogus"]) с неизвестным аргументом возвращает ненулевой код', async () => {
  const { result: code } = await quiet(() => main(['--bogus']));
  assert.notEqual(code, 0);
});

// Находка 5: --id без значения отвечал «Нет поста с id «undefined»», как
// будто такой пост действительно искали. Сообщение должно прямо говорить,
// что id не передан.
test('main(["--id"]) без значения прямо говорит, что id не передан, а не ищет пост «undefined»', async () => {
  const { result: code, errors } = await quiet(() => main(['--id']));
  assert.notEqual(code, 0);
  const joined = errors.join('\n');
  assert.doesNotMatch(joined, /undefined/, `сообщение не должно упоминать undefined: ${joined}`);
});

// Находка 6: ветка кропа по умолчанию (когда у кадра он не указан) реально
// используется каждым карточным кадром (card никогда не задаёт crop явно) —
// именно она выбирает высоту канваса: 1:1 для одиночных постов, 4:5 для
// остальных. Проверяем оба плеча тернарника напрямую по итоговым PNG.
test('buildPost: карточка без явного crop получает высоту по умолчанию (single → 1080×1080, иначе → 1080×1350)', async () => {
  const s = loadSources();
  const feed = loadFeed();

  const single = feed.find((p) => p.id === 'p02'); // format: single, карточка без crop
  const rSingle = await buildPost(s, single);
  const singlePng = readPngSize(fs.readFileSync(path.join(rSingle.dir, rSingle.files[0])));
  assert.equal(singlePng.width, 1080);
  assert.equal(singlePng.height, 1080, 'single без явного crop должен давать квадратную карточку');

  const carousel = feed.find((p) => p.id === 'p01'); // format: carousel, карточка era без crop
  const rCarousel = await buildPost(s, carousel);
  const eraCardPng = readPngSize(fs.readFileSync(path.join(rCarousel.dir, rCarousel.files[1])));
  assert.equal(eraCardPng.width, 1080);
  assert.equal(eraCardPng.height, 1350, 'carousel без явного crop должен давать портретную карточку');
});
