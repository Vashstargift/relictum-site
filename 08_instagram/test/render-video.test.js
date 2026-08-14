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
