#!/usr/bin/env node
/* Сборка постов Instagram из feed-data.js и снятых ассетов.
   Ничего не генерирует моделями — работает при нулевом балансе Higgsfield.

   node 08_instagram/build_feed.js --check      только проверка, ничего не пишет
   node 08_instagram/build_feed.js --id p03     собрать один пост
   node 08_instagram/build_feed.js --all        собрать все посты со статусом ready
*/
const fs = require('fs');
const path = require('path');
const { OUT_DIR, REPO } = require('./lib/paths.js');
const { loadSources } = require('./lib/sources.js');
const { validateFeed } = require('./lib/feed-schema.js');
const { renderCard } = require('./lib/render-card.js');
const { renderVideo, renderPhoto, extractCover } = require('./lib/render-video.js');

const FEED_FILE = path.join(REPO, '08_instagram', 'feed-data.js');

function loadFeed() {
  const prev = global.window;
  global.window = {};
  try {
    delete require.cache[require.resolve(FEED_FILE)];
    require(FEED_FILE);
    const feed = global.window.RELICTUM_FEED;
    if (!Array.isArray(feed)) throw new Error('feed-data.js не отдал RELICTUM_FEED');
    return feed;
  } finally {
    global.window = prev;
  }
}

function outDirFor(post) {
  const tail = post.exhibit || post.id;
  return path.join(OUT_DIR, `${post.date}_${post.rubric}_${tail}`);
}

function captionText(post) {
  const c = post.caption || {};
  return [c.lead, c.body, c.cta, (post.tags || []).join(' ')]
    .filter((s) => s && String(s).trim())
    .join('\n\n') + '\n';
}

async function buildPost(sources, post) {
  const dir = outDirFor(post);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const files = [];
  for (let i = 0; i < post.frames.length; i++) {
    const f = post.frames[i];
    const n = String(i + 1).padStart(2, '0');
    const crop = f.crop || (post.format === 'single' ? '1:1' : '4:5');

    if (f.type === 'video') {
      const out = path.join(dir, `${n}.mp4`);
      await renderVideo({ src: f.src, crop, out, trim: f.trim || null });
      await extractCover({ src: out, at: 2.0, out: path.join(dir, `${n}_cover.jpg`) });
      files.push(`${n}.mp4`);
    } else if (f.type === 'photo') {
      const out = path.join(dir, `${n}.jpg`);
      await renderPhoto({ src: f.src, crop, out });
      files.push(`${n}.jpg`);
    } else {
      const out = path.join(dir, `${n}.png`);
      const height = crop === '1:1' ? 1080 : 1350;
      await renderCard({ tpl: f.tpl, data: f.data || {}, out, width: 1080, height });
      files.push(`${n}.png`);
    }
  }

  fs.writeFileSync(path.join(dir, 'caption.txt'), captionText(post), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ id: post.id, date: post.date, rubric: post.rubric, exhibit: post.exhibit, slot: post.slot, format: post.format, files }, null, 2),
    'utf8'
  );
  return { dir, files };
}

function report(result) {
  for (const p of result.posts) {
    if (!p.ok) for (const problem of p.problems) console.error(`  ✗ ${problem}`);
  }
  for (const problem of result.problems) console.error(`  ✗ ${problem}`);
}

async function main(argv) {
  const sources = loadSources();
  const feed = loadFeed();
  const result = validateFeed(sources, feed);

  if (argv.includes('--check')) {
    if (result.ok) {
      console.log(`✓ лента цела: ${feed.length} постов, ритм 2+1 соблюдён, все факты сверены`);
      return 0;
    }
    console.error('Лента не прошла проверку:');
    report(result);
    return 1;
  }

  if (!result.ok) {
    console.error('Сборка остановлена — сначала почините ленту (--check):');
    report(result);
    return 1;
  }

  const idIndex = argv.indexOf('--id');
  let targets;
  if (idIndex !== -1) {
    const id = argv[idIndex + 1];
    targets = feed.filter((p) => p.id === id);
    if (targets.length === 0) {
      console.error(`Нет поста с id «${id}»`);
      return 1;
    }
  } else if (argv.includes('--all')) {
    targets = feed.filter((p) => p.status === 'ready');
  } else {
    console.error('Укажите --check, --id <id> или --all');
    return 1;
  }

  for (const post of targets) {
    const r = await buildPost(sources, post);
    console.log(`✓ ${post.id} → ${path.relative(REPO, r.dir)} (${r.files.length} кадров)`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { loadFeed, outDirFor, buildPost, main };
