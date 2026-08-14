/* Борд ленты: сетка, фильтр по рубрикам, календарь со статусами.
   Данные — window.RELICTUM_FEED. Проверок здесь нет: они в build_feed.js --check. */
(function () {
  var feed = (window.RELICTUM_FEED || []).slice().sort(function (a, b) { return a.slot - b.slot; });
  var RUBRIC_RU = {
    object: 'Объект недели', figure: 'Цифра', era: 'Эпохи', interior: 'Интерьер',
    expedition: 'Экспедиции', ritual: 'Ритуал', editions: 'Editions'
  };
  var active = null;

  function shown() {
    return active ? feed.filter(function (p) { return p.rubric === active; }) : feed;
  }

  function firstVisual(post) {
    for (var i = 0; i < post.frames.length; i++) {
      var f = post.frames[i];
      if (f.type === 'photo') return '../shared/img/' + f.src;
      if (f.type === 'video') return null;
    }
    return null;
  }

  function drawGrid() {
    var grid = document.getElementById('board-grid');
    grid.innerHTML = shown().map(function (p) {
      var img = firstVisual(p);
      var isGood = p.exhibit !== null && p.exhibit !== undefined;
      if (img) return '<div class="tile"><img src="' + img + '" alt=""></div>';
      return '<div class="tile quote' + (isGood ? '' : ' light') + '"><div><div class="q">'
        + (p.caption && p.caption.lead ? p.caption.lead : p.id)
        + '</div><div class="s">' + (RUBRIC_RU[p.rubric] || p.rubric) + '</div></div></div>';
    }).join('');
  }

  function drawTable() {
    var rows = shown().map(function (p) {
      var mark = p.status === 'ready' ? '✓' : (p.status === 'blocked' ? '✗' : '·');
      var note = (p.blockers && p.blockers.length) ? p.blockers.join('; ') : '';
      return '<tr><td>' + p.slot + '</td><td>' + p.date + '</td><td>'
        + (RUBRIC_RU[p.rubric] || p.rubric) + '</td><td>'
        + (p.exhibit || '—') + '</td><td>' + mark + ' ' + p.status + '</td><td>' + note + '</td></tr>';
    }).join('');
    document.getElementById('board-table').innerHTML =
      '<tr><th>Слот</th><th>Дата</th><th>Рубрика</th><th>Экспонат</th><th>Статус</th><th>Что мешает</th></tr>' + rows;
  }

  function drawFilters() {
    var used = [];
    feed.forEach(function (p) { if (used.indexOf(p.rubric) === -1) used.push(p.rubric); });
    var box = document.getElementById('board-filters');
    box.innerHTML = ['<button data-r="">Все</button>']
      .concat(used.map(function (r) { return '<button data-r="' + r + '">' + (RUBRIC_RU[r] || r) + '</button>'; }))
      .join('');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.style.cssText = 'font:inherit;font-size:12px;letter-spacing:.14em;text-transform:uppercase;'
        + 'padding:9px 16px;border:1px solid var(--line);background:transparent;cursor:pointer;color:var(--deep)';
      b.onclick = function () { active = b.dataset.r || null; drawGrid(); drawTable(); };
    });
  }

  if (!feed.length) return;
  drawFilters(); drawGrid(); drawTable();
})();
