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
