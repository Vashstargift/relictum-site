const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

module.exports = {
  REPO,
  IMG_DIR: path.join(REPO, 'shared', 'img'),
  FONTS_CSS: path.join(REPO, 'shared', 'fonts.css'),
  TEMPLATES_DIR: path.join(REPO, '08_instagram', 'templates'),
  OUT_DIR: path.join(REPO, '08_instagram', 'out'),
};
