const path = require('path');
const { REPO } = require('./paths.js');

// catalog.js и promo-data.js — браузерные файлы, они пишут в window,
// а не экспортируют через module.exports. Подставляем global.window,
// сбрасываем кэш require, читаем данные, потом возвращаем window на место.
const CATALOG_FILE = path.join(REPO, 'shared', 'catalog.js');
const PROMO_FILE = path.join(REPO, '16_product_promos', 'promo-data.js');

function loadSources() {
  const prevWindow = global.window;
  global.window = {};
  try {
    for (const file of [CATALOG_FILE, PROMO_FILE]) {
      delete require.cache[require.resolve(file)];
      require(file);
    }
    const catalog = global.window.RELICTUM_CATALOG;
    const promo = global.window.RELICTUM_PROMO;
    if (!Array.isArray(catalog)) throw new Error('shared/catalog.js не отдал RELICTUM_CATALOG');
    if (!promo || typeof promo !== 'object') throw new Error('promo-data.js не отдал RELICTUM_PROMO');
    return { catalog, promo };
  } finally {
    global.window = prevWindow;
  }
}

function findExhibit(sources, slug) {
  return sources.catalog.find((o) => o.slug === slug) || null;
}

function findPromo(sources, id) {
  return Object.prototype.hasOwnProperty.call(sources.promo, id) ? sources.promo[id] : null;
}

module.exports = { loadSources, findExhibit, findPromo };
