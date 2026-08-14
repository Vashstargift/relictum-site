const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { renderCard, readPngSize, buildInjectedHtml, chromePath } = require('../lib/render-card.js');
const { TEMPLATES_DIR } = require('../lib/paths.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-card-'));

// Дампит итоговый DOM страницы через `chrome --dump-dom`, чтобы проверить,
// что именно оказалось в разметке после выполнения инлайнового скрипта шаблона.
// Путь к Chrome берём из того же chromePath(), что использует сам
// render-card.js — раньше тест хранил свою копию строки пути, и она могла
// разъехаться с модулем при обновлении.
function dumpDom(htmlFile) {
  return new Promise((resolve, reject) => {
    execFile(chromePath(), [
      '--headless', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=8000',
      '--allow-file-access-from-files',
      '--dump-dom',
      `file://${htmlFile}`,
    ], { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`dump-dom не сработал: ${err.message}\n${stderr}`));
      resolve(stdout);
    });
  });
}

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

// Находка 1: гонка на имени временного файла. Несколько параллельных
// рендеров в одном процессе раньше могли получить одну и ту же миллисекунду
// в имени .tmp-файла — второй переписывал файл первого, а unlink первого
// падал на ENOENT и глушил уже готовый результат.
test('renderCard: параллельные рендеры не мешают друг другу', async () => {
  const jobs = [
    { tpl: 'figure', data: { name: 'Первый', big: '1', sub: 'один' }, out: path.join(tmp, 'parallel-1.png') },
    { tpl: 'figure', data: { name: 'Второй', big: '22', sub: 'два' }, out: path.join(tmp, 'parallel-2.png') },
    { tpl: 'figure', data: { name: 'Третий', big: '333', sub: 'три' }, out: path.join(tmp, 'parallel-3.png') },
    { tpl: 'end', data: { line: 'Четвёртый' }, out: path.join(tmp, 'parallel-4.png') },
    { tpl: 'end', data: { line: 'Пятый' }, out: path.join(tmp, 'parallel-5.png') },
  ];

  const results = await Promise.all(jobs.map((job) => renderCard(job)));
  for (const r of results) {
    assert.equal(r.width, 1080);
  }

  const buffers = jobs.map((job) => fs.readFileSync(job.out));
  for (const buf of buffers) {
    assert.ok(buf.length > 5000, 'PNG подозрительно маленький');
  }
  // карточки с разным текстом должны дать разное содержимое PNG
  for (let i = 0; i < buffers.length; i++) {
    for (let j = i + 1; j < buffers.length; j++) {
      assert.ok(!buffers[i].equals(buffers[j]), `parallel-${i + 1}.png и parallel-${j + 1}.png совпали`);
    }
  }
});

// Находка 3: данные вставляются через JSON.stringify без экранирования
// </script> — значение с такой последовательностью закрывает тег раньше
// времени и хвост JSON вылезает текстом/выполняется как посторонний скрипт.
test('renderCard экранирует </script> в данных: карточка рендерится, текст остаётся текстом', async () => {
  const evil = '</script><script>document.title="ВЗЛОМАНО"</script>';
  const out = path.join(tmp, 'escape-script.png');

  // рендер не должен падать и должен дать нормальную карточку
  const r = await renderCard({
    tpl: 'cover',
    data: { kicker: 'Проверка', title: 'Заголовок', sub: evil },
    out,
  });
  assert.equal(r.width, 1080);
  assert.equal(r.height, 1350);

  // строим ту же вставку данных, что и рендерер (buildInjectedHtml — тот же
  // код, что использует renderCard изнутри), и смотрим итоговый DOM: если бы
  // экранирования не было, </script> закрыл бы тег раньше времени, посторонний
  // <script> выполнился бы и подменил заголовок страницы
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'cover.html'), 'utf8');
  const injected = buildInjectedHtml(html, { kicker: 'Проверка', title: 'Заголовок', sub: evil });
  const tmpHtml = path.join(TEMPLATES_DIR, `.tmp-test-escape-${process.pid}.html`);
  fs.writeFileSync(tmpHtml, injected, 'utf8');
  try {
    const dom = await dumpDom(tmpHtml);
    // посторонний скрипт из данных не должен был выполниться
    assert.doesNotMatch(dom, /<title>ВЗЛОМАНО<\/title>/);
    // текст должен присутствовать в разметке как обычный (экранированный) текст
    assert.match(dom, /&lt;\/script&gt;&lt;script&gt;/);
  } finally {
    fs.rmSync(tmpHtml, { force: true });
  }
});

// Находка 4: spec.html собирает строки паспорта через innerHTML — значение
// с угловой скобкой ломает вёрстку строки молча (интерпретируется как тег).
test('spec.html: значение строки с угловой скобкой попадает как текст, а не разметка', async () => {
  const out = path.join(tmp, 'spec-escape.png');
  const r = await renderCard({
    tpl: 'spec',
    data: {
      name: 'Экспонат',
      rows: [['Метка', 'Значение с <b>жирным</b> внутри']],
    },
    out,
  });
  assert.equal(r.width, 1080);

  const html = fs.readFileSync(path.join(TEMPLATES_DIR, 'spec.html'), 'utf8');
  const injected = buildInjectedHtml(html, {
    name: 'Экспонат',
    rows: [['Метка', 'Значение с <b>жирным</b> внутри']],
  });
  const tmpHtml = path.join(TEMPLATES_DIR, `.tmp-test-spec-${process.pid}.html`);
  fs.writeFileSync(tmpHtml, injected, 'utf8');
  try {
    const dom = await dumpDom(tmpHtml);
    // значение должно остаться текстом (в разметке — как экранированные сущности),
    // а не превратиться в настоящий вложенный <b> внутри строки паспорта
    assert.match(dom, /Значение с &lt;b&gt;жирным&lt;\/b&gt; внутри/);
  } finally {
    fs.rmSync(tmpHtml, { force: true });
  }
});

// Находка 5: runChrome теряет причину падения execFile — при недоступном
// бинарнике наружу уходит пустое сообщение без причины.
test('renderCard: понятная ошибка, если Chrome не найден по CHROME_PATH', async () => {
  const prev = process.env.CHROME_PATH;
  process.env.CHROME_PATH = '/no/such/chrome-binary';
  try {
    await assert.rejects(
      () => renderCard({ tpl: 'end', data: {}, out: path.join(tmp, 'no-chrome.png') }),
      (err) => {
        assert.match(err.message, /Chrome не сделал снимок/);
        // причина падения execFile (ENOENT и т.п.) должна попасть в сообщение
        assert.match(err.message, /ENOENT|no such file|not found/i);
        return true;
      }
    );
  } finally {
    if (prev === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = prev;
  }
});

// Находка 7: временный файл создаётся до входа в try/finally — исключение
// при создании каталога вывода оставляет .tmp-*.html в каталоге шаблонов навсегда.
test('renderCard: временный файл не остаётся при ошибке создания каталога вывода', async () => {
  const before = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.startsWith('.tmp-'));
  // out указывает на путь, где директорию создать нельзя (родитель — обычный файл)
  const blockerFile = path.join(tmp, 'blocker-file');
  fs.writeFileSync(blockerFile, 'x');
  const badOut = path.join(blockerFile, 'sub', 'card.png');

  await assert.rejects(() => renderCard({ tpl: 'end', data: {}, out: badOut }));

  const after = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.startsWith('.tmp-'));
  assert.deepEqual(after, before, 'после ошибки не должно остаться .tmp-*.html файлов');
});
