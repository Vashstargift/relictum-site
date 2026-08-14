const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { IMG_DIR } = require('../lib/paths.js');
const { probeVideo, renderVideo, renderPhoto, extractCover } = require('../lib/render-video.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relictum-video-'));
const SPIN = path.join(IMG_DIR, 'spin_megalodon.mp4');

// Копия спина без звуковой дорожки — только для тестов, во временном
// каталоге, в репозиторий не кладём. Нужна, чтобы прогнать ветку рендера
// без аудио (подмешивание тишины) на том же видеоряде, что и версия со звуком.
const SPIN_NO_AUDIO = path.join(tmp, 'spin-no-audio.mp4');
execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
  '-y', '-v', 'error', '-i', SPIN, '-an', '-c:v', 'copy', SPIN_NO_AUDIO,
]);

// Подставной ffmpeg для тестов: пишем shell-скрипт во временный каталог и
// временно подсовываем его через FFMPEG_PATH, чтобы проверить поведение
// модуля без реального рендера (порядок аргументов, обработку «успешного»,
// но по факту ничего не сделавшего вызова).
let stubCounter = 0;
function makeFfmpegStub(script) {
  const p = path.join(tmp, `ffmpeg-stub-${process.pid}-${stubCounter++}.sh`);
  fs.writeFileSync(p, `#!/bin/sh\n${script}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

async function withFfmpegStub(script, fn) {
  const stub = makeFfmpegStub(script);
  const prev = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = stub;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = prev;
  }
}

async function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = '';
  process.stderr.write = (chunk) => { buf += chunk.toString(); return true; };
  try {
    await fn();
  } finally {
    process.stderr.write = orig;
  }
  return buf;
}

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

// Находка 1: обрезка за пределами длительности исходника — ffmpeg пишет
// пустой ~261-байтный mp4 и завершается кодом 0, наша проверка размеров
// справедливо бросает исключение, но битый файл раньше оставался на диске.
test('renderVideo удаляет частично записанный файл при падении рендера', async () => {
  const out = path.join(tmp, 'v-broken-trim.mp4');
  await assert.rejects(
    () => renderVideo({ src: 'spin_megalodon.mp4', crop: '1:1', out, trim: [100, 2] }),
    /ожидали/
  );
  assert.equal(fs.existsSync(out), false, 'частично записанный файл должен быть удалён после ошибки');
});

// Находка 2: renderPhoto слепо доверяет ffprobe и не проверяет результат.
// Подсовываем «успешный» (код 0), но ничего не сделавший ffmpeg поверх уже
// лежащего на месте результата файла неверного размера — раньше renderPhoto
// вернул бы эти неверные размеры вместо того, чтобы упасть.
test('renderPhoto проверяет размеры результата и падает при несовпадении', async () => {
  const out = path.join(tmp, 'photo-mismatch.jpg');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1080x1080:d=1',
    '-frames:v', '1', out,
  ]);
  await withFfmpegStub('exit 0', () => assert.rejects(
    () => renderPhoto({ src: 'int_ph_megalodon.jpg', crop: '4:5', out }),
    /ожидали 1080x1350/
  ));
  assert.equal(fs.existsSync(out), false, 'битый файл должен быть удалён после ошибки (Находка 1 для фото)');
});

// Находка 3: спины 1284×716 при кропе 4:5 дают крoп 572.8×716 и апскейл
// ×1080/572.8 ≈ 1.9 — заметно выше порога. При кропе 1:1 те же спины дают
// ×1080/716 ≈ 1.5 — ниже порога, предупреждения быть не должно.
test('renderVideo предупреждает об апскейле для спина в формате 4:5', async () => {
  const out = path.join(tmp, 'warn45.mp4');
  const stderr = await captureStderr(() => renderVideo({ src: 'spin_megalodon.mp4', crop: '4:5', out }));
  assert.match(stderr, /апскейл/i);
  assert.match(stderr, /spin_megalodon\.mp4/);
  assert.match(stderr, /4:5/);
});

test('renderVideo не предупреждает об апскейле для того же спина в формате 1:1', async () => {
  const out = path.join(tmp, 'warn11.mp4');
  const stderr = await captureStderr(() => renderVideo({ src: 'spin_megalodon.mp4', crop: '1:1', out }));
  assert.doesNotMatch(stderr, /апскейл/i);
});

// Находка 4: probeVideo на несуществующем файле должен давать русское
// сообщение, как и остальные функции модуля (resolveSrc и т.п.), а не сырую
// английскую ошибку Node с путём хоста.
test('probeVideo даёт русское сообщение на несуществующем файле', () => {
  assert.throws(() => probeVideo('/no/such/video.mp4'), /нет файла/);
});

// Находка 5: -t из-за порядка аргументов привязывался к следующему за
// видео входу с тишиной, а не к самому видео. Результат сейчас случайно
// верный благодаря -shortest (см. тесты ниже на длительность), поэтому
// проверяем сам порядок аргументов через подставной ffmpeg.
test('renderVideo: -t стоит перед -i видео-входа, а не перед входом с тишиной', async () => {
  const argvLog = path.join(tmp, 'ffmpeg-argv.log');
  await withFfmpegStub(`printf '%s\\n' "$@" > ${JSON.stringify(argvLog)}\nexit 0`, () => assert.rejects(
    () => renderVideo({ src: SPIN_NO_AUDIO, crop: '1:1', out: path.join(tmp, 'stub-out.mp4'), trim: [1, 2] })
  ));
  const argv = fs.readFileSync(argvLog, 'utf8').split('\n').filter(Boolean);
  const iPositions = argv.reduce((acc, a, i) => (a === '-i' ? acc.concat(i) : acc), []);
  const tPos = argv.indexOf('-t');
  assert.equal(iPositions.length, 2, 'должно быть два входа: видео и тишина');
  assert.ok(tPos !== -1, '-t должен присутствовать в команде');
  assert.ok(
    tPos < iPositions[0],
    `-t (позиция ${tPos}) должен стоять до -i видео-входа (позиция ${iPositions[0]}), а не после`
  );
});

test('renderVideo: обрезка даёт верную длительность для видео со звуком', async () => {
  const out = path.join(tmp, 'v-audio-trim.mp4');
  await renderVideo({ src: 'spin_megalodon.mp4', crop: '1:1', out, trim: [1, 2] });
  const dur = probeVideo(out).duration;
  assert.ok(dur > 1.7 && dur < 2.3, `ожидали ~2с, получили ${dur}`);
});

test('renderVideo: обрезка даёт верную длительность для видео без звука', async () => {
  const out = path.join(tmp, 'v-noaudio-trim.mp4');
  await renderVideo({ src: SPIN_NO_AUDIO, crop: '1:1', out, trim: [1, 2] });
  const dur = probeVideo(out).duration;
  assert.ok(dur > 1.7 && dur < 2.3, `ожидали ~2с, получили ${dur}`);
});

// Находка 6: renderPhoto при неизвестном кропе не перечислял варианты,
// в отличие от renderVideo.
test('renderPhoto отклоняет неизвестный кроп и перечисляет доступные варианты', async () => {
  await assert.rejects(
    () => renderPhoto({ src: 'int_ph_megalodon.jpg', crop: '16:9', out: path.join(tmp, 'badcrop.jpg') }),
    /4:5/
  );
});
