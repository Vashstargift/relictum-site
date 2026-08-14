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
