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
