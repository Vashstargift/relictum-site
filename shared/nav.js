/* RELICTUM — универсальное мобильное меню.
   Строит гамбургер + полноэкранную панель из существующих ссылок навигации.
   Поддерживает структуры: .nav-links/.nav-actions (V1) и .nav ul/.nav .right (V2–V4). */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav || nav.querySelector('.nav-burger')) return;

  var sources = ['.nav-links a', '.nav ul a', '.nav-actions a', '.nav .right a'];
  var seen = [];
  sources.forEach(function (sel) {
    nav.querySelectorAll(sel).forEach(function (a) {
      var txt = (a.textContent || '').trim();
      if (!txt || txt === '⌕' || txt.length > 40) return;
      if (seen.some(function (s) { return s.t === txt; })) return;
      seen.push({ t: txt, href: a.getAttribute('href') || '#' });
    });
  });
  if (!seen.length) return;

  var burger = document.createElement('button');
  burger.className = 'nav-burger';
  burger.setAttribute('aria-label', 'Меню');
  burger.innerHTML = '<span></span><span></span><span></span>';
  nav.appendChild(burger);

  var drawer = document.createElement('div');
  drawer.className = 'nav-drawer';
  var inner = document.createElement('nav');
  inner.className = 'nav-drawer-inner';
  seen.forEach(function (l) {
    var a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.t;
    inner.appendChild(a);
  });
  /* 02.10.2026 Меню телефона: сверху иконки (избранное, корзина, кабинет) и крестик,
     в центре разделы и языки, внизу контакты */
  var cat = seen.filter(function (l) { return /catalog\.html/.test(l.href); })[0];
  var pre = cat ? cat.href.replace(/catalog\.html.*$/, '') : '';
  var ico = {
    fav: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M12 2.6l2.1 6.05 6.3.35-4.9 3.95 1.65 6.1L12 15.6l-5.15 3.45 1.65-6.1-4.9-3.95 6.3-.35z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M3.6 7.4h16.8v12.2H3.6z"/><path d="M3.6 11h16.8"/><path d="M9.4 7.4V4.4h5.2v3"/></svg>',
    acc: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M5.4 19.4c0-3.4 3-5.5 6.6-5.5s6.6 2.1 6.6 5.5"/></svg>'
  };
  var top = document.createElement('div');
  top.className = 'nd-top';
  top.innerHTML =
    '<div class="nd-icons">' +
      '<a href="' + pre + 'account.html#favorites" aria-label="Избранное">' + ico.fav + '<i class="nd-badge" data-b="fav"></i></a>' +
      '<a href="' + pre + 'cart.html" aria-label="Корзина">' + ico.cart + '<i class="nd-badge" data-b="cart"></i></a>' +
      '<a href="' + pre + 'account.html" aria-label="Личный кабинет">' + ico.acc + '</a>' +
    '</div>' +
    '<button class="nav-drawer-close" aria-label="Закрыть меню"><span></span><span></span></button>';
  drawer.appendChild(top);
  var lang = document.createElement('div');
  lang.className = 'nd-lang';            /* сюда i18n.js ставит переключатель языков */
  inner.appendChild(lang);
  drawer.appendChild(inner);
  var foot = document.createElement('div');
  foot.className = 'nd-foot';
  foot.innerHTML =
    '<a class="nd-phone" href="tel:+74952335111">+7 495 233-51-11</a>' +
    '<div class="nd-msg"><a href="https://wa.me/74952335111" target="_blank" rel="noopener">WhatsApp</a><span>·</span>' +
    '<a href="https://t.me/stargiftgallerybot" target="_blank" rel="noopener">Telegram</a></div>' +
    '<div class="nd-addr">Москва, Большая Якиманка, 22 · ТЦ «Гименей»</div>';
  drawer.appendChild(foot);
  document.body.appendChild(drawer);

  function badges() {
    var S = window.RelictumShop; if (!S) return;
    [['fav', S.favCount ? S.favCount() : 0], ['cart', S.count ? S.count() : 0]].forEach(function (x) {
      var b = top.querySelector('[data-b="' + x[0] + '"]'); if (!b) return;
      b.textContent = x[1] > 0 ? x[1] : ''; b.style.display = x[1] > 0 ? '' : 'none';
    });
  }

  function toggle(open) {
    if (open) badges();
    document.body.classList.toggle('nav-open', open);
    burger.classList.toggle('is-open', open);
  }
  burger.addEventListener('click', function () {
    toggle(!document.body.classList.contains('nav-open'));
  });
  drawer.addEventListener('click', function (e) {
    if (e.target.tagName === 'A' || e.target === drawer || e.target.closest('.nav-drawer-close')) toggle(false);
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') toggle(false);
  });
})();
