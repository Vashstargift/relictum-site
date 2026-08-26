const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { loadSources } = require('../lib/sources.js');
const { readPngSize } = require('../lib/render-card.js');
const { loadFeed, outDirFor, buildPost, buildAll, pruneOutDir, main } = require('../build_feed.js');

// Находка I4: тесты собирали посты в настоящий каталог выдачи out/, и после
// прогона среди пятнадцати постов оставались фальшивые. Всё, что тесты
// пишут, живёт во временном каталоге ОС.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-out-'));

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
  const r = await buildPost(s, post, OUT);
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
  const post = loadFeed().find((p) => p.id === 'p03'); // photo, video, spec-card, end-card
  const r = await buildPost(s, post, OUT);

  const actualFiles = fs.readdirSync(r.dir)
    .filter((f) => f !== 'caption.txt' && f !== 'meta.json')
    .sort();
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  const listedNames = meta.files.map((e) => e.name).sort();

  assert.deepEqual(listedNames, actualFiles, 'meta.json.files должен перечислять ровно то, что реально лежит в папке');

  const cover = meta.files.find((e) => e.name === '02_cover.jpg');
  assert.ok(cover, 'обложка видео-кадра должна попасть в список');
  assert.equal(cover.role, 'cover');

  const frame = meta.files.find((e) => e.name === '02.mp4');
  assert.ok(frame);
  assert.equal(frame.role, 'frame');

  // Общий order у обложки и её кадра, но разная роль — потребитель отличит
  // обложку от следующего кадра листания и не спутает порядок.
  assert.equal(cover.order, frame.order);

  const frameOrders = meta.files.filter((e) => e.role === 'frame').map((e) => e.order);
  // Число кадров у поста меняется при правках композиции, поэтому проверяем
  // само свойство — нумерация идёт подряд с единицы, без пропусков и повторов.
  const expectedOrders = post.frames.map((_, i) => i + 1);
  assert.deepEqual(frameOrders, expectedOrders,
    'порядок листания по кадрам должен идти без пропусков и повторов');
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
  const { result: summary } = await quiet(() => buildAll(s, feed, OUT));

  assert.deepEqual(summary.built.sort(), ['ok-1', 'ok-2'], 'здоровые посты должны собраться несмотря на соседний брак');
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.failed[0].id, 'broken');
  assert.match(summary.failed[0].message, /no-such-template|такого шаблона/, 'причина падения должна быть названа');

  // Находка 3 заодно: недостроенная папка упавшего поста не должна остаться
  // на диске похожей на готовую.
  const brokenPost = feed.find((p) => p.id === 'broken');
  assert.equal(fs.existsSync(outDirFor(brokenPost, OUT)), false, 'папка упавшего поста должна быть удалена целиком');
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

// Находка 6: высоту канваса карточки выбирает пропорция поста (кадр своей
// не имеет — C2): 1:1 даёт 1080×1080, 4:5 — 1080×1350. Проверяем оба плеча
// напрямую по итоговым PNG.
test('buildPost: высота карточки берётся из пропорции поста (1:1 → 1080×1080, 4:5 → 1080×1350)', async () => {
  const s = loadSources();
  const feed = loadFeed();

  // Карточку ищем по расширению, а не по номеру кадра: композиция постов
  // меняется (первым кадром теперь всегда фотография или видео), и жёсткий
  // индекс ломал бы тест при каждой такой правке.
  const cardOf = (r) => r.files.find((f) => f.endsWith('.png'));

  const square = feed.find((p) => p.id === 'p02'); // aspect: 1:1
  const rSquare = await buildPost(s, square, OUT);
  const squarePng = readPngSize(fs.readFileSync(path.join(rSquare.dir, cardOf(rSquare))));
  assert.equal(squarePng.width, 1080);
  assert.equal(squarePng.height, 1080, 'пост 1:1 должен давать квадратную карточку');

  const portrait = feed.find((p) => p.id === 'p01'); // aspect: 4:5
  const rPortrait = await buildPost(s, portrait, OUT);
  const eraCardPng = readPngSize(fs.readFileSync(path.join(rPortrait.dir, cardOf(rPortrait))));
  assert.equal(eraCardPng.width, 1080);
  assert.equal(eraCardPng.height, 1350, 'пост 4:5 должен давать портретную карточку');
});

// C2: все кадры поста собираются в одной пропорции — Instagram приводит
// карусель к одному соотношению, и кадр другой пропорции он обрежет
// (у карточки-паспорта срезался бы колонтитул).
test('buildPost: все кадры товарного поста собраны в одной пропорции 1:1', async () => {
  const s = loadSources();
  const post = loadFeed().find((p) => p.id === 'p03');
  const r = await buildPost(s, post, OUT);
  const meta = JSON.parse(fs.readFileSync(path.join(r.dir, 'meta.json'), 'utf8'));
  assert.equal(meta.aspect, '1:1');

  const sizes = [];
  for (const name of r.files) {
    const file = path.join(r.dir, name);
    if (name.endsWith('.png')) {
      const s2 = readPngSize(fs.readFileSync(file));
      sizes.push(`${s2.width}x${s2.height}`);
    } else {
      const probe = execFileSync(process.env.FFPROBE_PATH || 'ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
      ]).toString().trim().replace(',', 'x');
      sizes.push(probe);
    }
  }
  assert.deepEqual([...new Set(sizes)], ['1080x1080'], `все кадры должны быть 1:1, а получили ${sizes.join(', ')}`);
});

// I6: обложка — единственное, что видно в сетке ленты, и снимать её жёстко
// на 2,0 секунды нельзя: на некоторых роликах в этот момент животное частью
// вне кадра. Время задаётся у кадра.
test('buildPost: обложка снимается со времени, заданного у кадра', async () => {
  const s = loadSources();
  const base = loadFeed().find((p) => p.id === 'p12');
  const videoFrame = base.frames.find((f) => f.type === 'video');
  assert.equal(typeof videoFrame.cover, 'number', 'у кадра p12 должно быть своё время обложки');

  const withDefault = Object.assign({}, base, {
    id: 'cover-default',
    exhibit: null,
    frames: [Object.assign({}, videoFrame, { cover: undefined })],
  });
  const withOwn = Object.assign({}, base, {
    id: 'cover-own',
    exhibit: null,
    frames: [videoFrame],
  });

  const rDefault = await buildPost(s, withDefault, OUT);
  const rOwn = await buildPost(s, withOwn, OUT);
  const a = fs.readFileSync(path.join(rDefault.dir, '01_cover.jpg'));
  const b = fs.readFileSync(path.join(rOwn.dir, '01_cover.jpg'));
  assert.ok(!a.equals(b), 'обложка со своим временем должна отличаться от обложки по умолчанию');
});

// --- I2: негодный пост не должен блокировать сборку годных ---

// Синтетическая лента во временном каталоге: два здоровых поста и один без
// ассета. Боевую feed-data.js для этого ломать незачем.
function writeFeed(dir, body) {
  const file = path.join(dir, `feed-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

const MIXED_FEED = `
  window.RELICTUM_FEED = [
    { id: 'ok-a', date: '2026-01-01', rubric: 'era', slot: 1, exhibit: null, format: 'single', aspect: '1:1',
      frames: [{ type: 'card', tpl: 'end', data: {} }],
      caption: { lead: 'Годный' }, tags: [], facts: [], status: 'ready', blockers: [] },
    { id: 'no-asset', date: '2026-01-02', rubric: 'era', slot: 2, exhibit: null, format: 'single', aspect: '1:1',
      frames: [{ type: 'video', src: 'нет-такого-файла.mp4' }],
      caption: { lead: 'Черновик без ассета' }, tags: [], facts: [], status: 'ready', blockers: [] },
    { id: 'ok-b', date: '2026-01-03', rubric: 'object', slot: 3, exhibit: 'megalodon-tooth', format: 'single', aspect: '1:1',
      frames: [{ type: 'card', tpl: 'end', data: {} }],
      caption: { lead: 'Годный товарный' }, tags: [], facts: [], status: 'ready', blockers: [] },
  ];
`;

test('--all: негодный пост пропускается с объяснением, годные собираются', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-feed-'));
  const feedFile = writeFeed(dir, MIXED_FEED);
  const outRoot = path.join(dir, 'out');

  const { result: code, errors } = await quiet(() => main(['--all'], { outRoot, feedFile }));

  const dirs = fs.readdirSync(outRoot).sort();
  assert.deepEqual(dirs, ['2026-01-01_era_ok-a', '2026-01-03_object_megalodon-tooth'], 'годные посты должны собраться');
  assert.notEqual(code, 0, 'пропуск поста должен давать ненулевой код');
  const joined = errors.join('\n');
  assert.match(joined, /no-asset/);
  assert.match(joined, /не найден/, 'причина пропуска должна быть названа');
});

test('--id по здоровому посту собирается, даже если в ленте есть негодный', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-feed-'));
  const feedFile = writeFeed(dir, MIXED_FEED);
  const outRoot = path.join(dir, 'out');

  const { result: code } = await quiet(() => main(['--id', 'ok-b'], { outRoot, feedFile }));

  assert.equal(code, 0, 'здоровый пост собирается несмотря на соседний брак в ленте');
  assert.deepEqual(fs.readdirSync(outRoot), ['2026-01-03_object_megalodon-tooth']);
});

test('--check по-прежнему сообщает обо всех проблемах ленты и возвращает ненулевой код', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-feed-'));
  const feedFile = writeFeed(dir, MIXED_FEED);

  const { result: code, errors } = await quiet(() => main(['--check'], { outRoot: path.join(dir, 'out'), feedFile }));

  assert.notEqual(code, 0);
  assert.match(errors.join('\n'), /no-asset/);
});

// --- I5: полная сборка приводит выдачу в соответствие с лентой ---

test('--all убирает из выдачи папки, которых нет в ленте', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-feed-'));
  const feedFile = writeFeed(dir, `
    window.RELICTUM_FEED = [
      { id: 'ok-a', date: '2026-01-01', rubric: 'era', slot: 1, exhibit: null, format: 'single', aspect: '1:1',
        frames: [{ type: 'card', tpl: 'end', data: {} }],
        caption: { lead: 'Годный' }, tags: [], facts: [], status: 'ready', blockers: [] },
    ];
  `);
  const outRoot = path.join(dir, 'out');
  // Папка от прошлого прогона: пост перенесли на другую дату — старая
  // осталась бы в выдаче, и владелец рискует залить именно её.
  fs.mkdirSync(path.join(outRoot, '2025-12-01_era_ok-a'), { recursive: true });
  fs.writeFileSync(path.join(outRoot, '2025-12-01_era_ok-a', 'caption.txt'), 'старьё\n', 'utf8');

  const { result: code } = await quiet(() => main(['--all'], { outRoot, feedFile }));

  assert.equal(code, 0);
  assert.deepEqual(fs.readdirSync(outRoot), ['2026-01-01_era_ok-a'], 'устаревшая папка должна быть убрана');
});

test('pruneOutDir не трогает папки, которые велено сохранить, и терпит отсутствие каталога', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-prune-'));
  fs.mkdirSync(path.join(dir, 'keep'));
  fs.mkdirSync(path.join(dir, 'drop'));
  const removed = pruneOutDir(dir, [path.join(dir, 'keep')]);
  assert.deepEqual(removed, ['drop']);
  assert.deepEqual(fs.readdirSync(dir), ['keep']);
  assert.deepEqual(pruneOutDir(path.join(dir, 'нет-такого'), []), []);
});
