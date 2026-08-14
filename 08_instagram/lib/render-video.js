const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const { IMG_DIR } = require('./paths.js');

// Читаем переменные окружения не в момент require(), а при каждом вызове —
// иначе переопределение FFMPEG_PATH/FFPROBE_PATH в рантайме (в т.ч. в тестах,
// чтобы подсунуть подставной бинарник) не имеет эффекта, потому что модуль
// уже закэшировал старое значение (тот же приём, что и chromePath() в
// render-card.js).
function ffmpegBin() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
function ffprobeBin() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

// Порог, после которого апскейл кропа до целевого размера считаем заметным
// на глаз («на грани мыла») и предупреждаем, а не молчим.
const UPSCALE_WARN_THRESHOLD = 1.6;

// Центральный кроп. Подложки отклонены: размытая даёт призрак объекта,
// заливка цветом — видимый шов (фон исходников неоднороден).
const CROPS = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
};

// Прямоугольник центрального кропа для исходника ЛЮБОЙ ориентации.
// Прежняя формула (crop=ih*4/5:ih) молча считала исходник горизонтальным:
// на вертикальном 1080×1920 она просила кадр шириной 1536 пикселей — шире
// самого исходника, и ffmpeg падал сырым английским сообщением. Берём
// наибольший прямоугольник целевого соотношения, который влезает в кадр:
// по одной стороне упираемся в исходник, вторую считаем от неё. Стороны
// приводим к чётным — h264 не кодирует нечётные размеры.
function cropRect(spec, srcWidth, srcHeight) {
  if (!Number.isFinite(srcWidth) || !Number.isFinite(srcHeight) || srcWidth < 2 || srcHeight < 2) {
    throw new Error(`не разобрал размеры исходника (${srcWidth}x${srcHeight})`);
  }
  const ratio = spec.width / spec.height;
  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  return {
    width: even(Math.min(srcWidth, srcHeight * ratio)),
    height: even(Math.min(srcHeight, srcWidth / ratio)),
  };
}

// Фильтр ffmpeg: центральный кроп посчитанного прямоугольника и масштаб под
// целевой размер. Размеры кропа считаем в JS по реальным размерам исходника,
// а не выражением от ih/iw — так формула видна и проверяема в тестах.
function cropFilter(spec, srcWidth, srcHeight) {
  const rect = cropRect(spec, srcWidth, srcHeight);
  return `crop=${rect.width}:${rect.height},scale=${spec.width}:${spec.height}:flags=lanczos`;
}

function resolveSrc(src) {
  const file = path.isAbsolute(src) ? src : path.join(IMG_DIR, src);
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  return file;
}

function probeVideo(file) {
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  try {
    const v = execFileSync(ffprobeBin(), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]).toString().trim().split('\n');
    const a = execFileSync(ffprobeBin(), [
      '-v', 'error', '-select_streams', 'a',
      '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file,
    ]).toString().trim();
    return {
      width: Number(v[0]),
      height: Number(v[1]),
      duration: Number(v[2]),
      hasAudio: a.length > 0,
    };
  } catch (err) {
    throw new Error(`не удалось прочитать видео ${file}`);
  }
}

// Размеры кадра для изображений (renderPhoto: и источник, и результат).
function probeSize(file) {
  if (!fs.existsSync(file)) throw new Error(`нет файла ${file}`);
  try {
    const v = execFileSync(ffprobeBin(), [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
    ]).toString().trim().split(',');
    return { width: Number(v[0]), height: Number(v[1]) };
  } catch (err) {
    throw new Error(`не удалось прочитать изображение ${file}`);
  }
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg упал:\n${stderr}`));
      resolve(stderr);
    });
  });
}

// Best-effort удаление недописанного результата, чтобы после падения
// рендера (на любом этапе — сам ffmpeg или последующая проверка размеров)
// по пути назначения не оставался битый файл.
function cleanupPartial(out) {
  try {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  } catch (_) {
    // не критично — файл всё равно битый, лучшее, что можем — попытаться
  }
}

// Кроп вырезает прямоугольник целевого соотношения (см. cropRect) и тянет
// его до целевого размера — масштаб равномерен и равен
// spec.height / высоту кропа. Предупреждаем, если апскейл заметный.
function warnIfUpscaled(file, crop, spec, sourceWidth, sourceHeight) {
  const factor = spec.height / cropRect(spec, sourceWidth, sourceHeight).height;
  if (factor > UPSCALE_WARN_THRESHOLD) {
    process.stderr.write(
      `апскейл: ${path.basename(file)} формат ${crop} ×${factor.toFixed(2)} `
      + `(порог ×${UPSCALE_WARN_THRESHOLD})\n`
    );
  }
  return factor;
}

async function renderVideo({ src, crop = '4:5', out, trim = null }) {
  const spec = CROPS[crop];
  if (!spec) throw new Error(`неизвестный кроп «${crop}», доступны ${Object.keys(CROPS).join(', ')}`);
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const srcInfo = probeVideo(file);
  warnIfUpscaled(file, crop, spec, srcInfo.width, srcInfo.height);
  const filter = cropFilter(spec, srcInfo.width, srcInfo.height);

  const args = ['-y', '-v', 'error'];
  // -ss и -t — входные опции: обе должны стоять перед «своим» -i (видео),
  // иначе -t привяжется к следующему -i (тишине), а не к видео.
  if (trim) args.push('-ss', String(trim[0]), '-t', String(trim[1]));
  args.push('-i', file);
  if (!srcInfo.hasAudio) {
    // Reels без аудиодорожки не принимаются — подмешиваем тишину
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest');
  }
  args.push('-vf', filter, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);

  try {
    await run(args);
    const got = probeVideo(out);
    if (got.width !== spec.width || got.height !== spec.height) {
      throw new Error(`ожидали ${spec.width}x${spec.height}, получили ${got.width}x${got.height}`);
    }
    return { path: out, width: got.width, height: got.height };
  } catch (err) {
    cleanupPartial(out);
    throw err;
  }
}

async function renderPhoto({ src, crop = '4:5', out }) {
  const spec = CROPS[crop];
  if (!spec) throw new Error(`неизвестный кроп «${crop}», доступны ${Object.keys(CROPS).join(', ')}`);
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const srcSize = probeSize(file);
  warnIfUpscaled(file, crop, spec, srcSize.width, srcSize.height);
  const filter = cropFilter(spec, srcSize.width, srcSize.height);

  try {
    await run(['-y', '-v', 'error', '-i', file, '-vf', filter, '-q:v', '2', out]);
    const got = probeSize(out);
    if (got.width !== spec.width || got.height !== spec.height) {
      throw new Error(`ожидали ${spec.width}x${spec.height}, получили ${got.width}x${got.height}`);
    }
    return { path: out, width: got.width, height: got.height };
  } catch (err) {
    cleanupPartial(out);
    throw err;
  }
}

async function extractCover({ src, at = 2.5, out }) {
  const file = resolveSrc(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run(['-y', '-v', 'error', '-ss', String(at), '-i', file, '-frames:v', '1', '-q:v', '2', out]);
  return { path: out };
}

module.exports = { probeVideo, renderVideo, renderPhoto, extractCover, cropRect, cropFilter, CROPS };
