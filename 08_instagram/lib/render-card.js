const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { TEMPLATES_DIR } = require('./paths.js');

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// CHROME_PATH читаем не в момент require(), а при каждом вызове — иначе
// переопределение переменной окружения в рантайме (в т.ч. в тестах) не
// имеет эффекта, потому что модуль уже закэшировал старое значение.
function chromePath() {
  return process.env.CHROME_PATH || DEFAULT_CHROME;
}

function readPngSize(buf) {
  if (buf.length < 24 || buf[0] !== 0x89) throw new Error('это не PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// JSON.stringify не экранирует </script>, &amp; и подобные последовательности.
// Значение вида "</script><script>...</script>" в данных закрыло бы наш
// служебный <script> раньше времени и выполнилось бы как посторонний код.
// Экранируем в юникод-виде — валидно внутри строкового литерала JS и не меняет
// то, что увидит JSON.parse/сам код на другой стороне.
function escapeForInlineScript(json) {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function buildInjectedHtml(html, data) {
  const json = escapeForInlineScript(JSON.stringify(data || {}));
  return html.replace(
    '<!--CARD_DATA-->',
    `<script>window.CARD_DATA = ${json};</script>`
  );
}

function runChrome(args) {
  return new Promise((resolve, reject) => {
    execFile(chromePath(), args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      if (/written to file/.test(output)) return resolve(output);
      const reason = err ? err.message : 'неизвестная ошибка (в выводе нет «written to file»)';
      reject(new Error(`Chrome не сделал снимок: ${reason}\n${output}`));
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
  const injected = buildInjectedHtml(html, data);

  // временный файл кладём рядом с шаблонами, чтобы относительные пути к CSS
  // работали; имя гарантированно уникально (pid+время+случайные байты), чтобы
  // параллельные renderCard() в одном процессе не переписывали файлы друг
  // друга. Создание файла — внутри try, чтобы падение на любом следующем шаге
  // (например mkdirSync каталога вывода) не оставило .tmp-*.html навсегда.
  let tmpFile;
  try {
    const unique = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    tmpFile = path.join(TEMPLATES_DIR, `.tmp-${unique}.html`);
    fs.writeFileSync(tmpFile, injected, 'utf8');
    fs.mkdirSync(path.dirname(out), { recursive: true });

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
    // force: true — не падаем, если файла уже нет (например, гонка на имени
    // в старом баге, или сам renderCard упал ещё до записи файла)
    if (tmpFile) await fs.promises.rm(tmpFile, { force: true });
  }

  const size = readPngSize(fs.readFileSync(out));
  if (size.width !== width || size.height !== height) {
    throw new Error(`ожидали ${width}x${height}, получили ${size.width}x${size.height}`);
  }
  return { path: out, ...size };
}

module.exports = { renderCard, readPngSize, buildInjectedHtml };
