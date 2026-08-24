/* RELICTUM — посадка кадров галереи (сборщик, на который ссылаются
   catalog.html и exhibit.html).
   Плитки галереи держат один горизонтальный формат 3:2. Горизонтальный кадр
   заполняет плитку как есть; вертикальный и квадратный не режем пополам —
   вписываем целиком, а поля закрываем размытой копией самого кадра,
   чтобы не было стыка. Кадр лежит на z-index:1 (см. CSS плитки),
   подложка — под ним.
   Ручная посадка отдельного кадра важнее автоматики и задаётся до рендера:
   window.RELICTUM_FOCUS['имя.jpg'] = 38      // object-position по вертикали, %
   window.RELICTUM_FOCUS['имя.jpg'] = 'tile'  // готовая плитка tile_имя.jpg */
(function(){
  window.RELICTUM_FOCUS = window.RELICTUM_FOCUS || {};

  var COVER_MIN = 1.25; /* шире — почти ничего не теряется, оставляем кроп */

  function seat(img){
    if(img.dataset.seated) return;
    var w = img.naturalWidth, h = img.naturalHeight;
    if(!w || !h) return;
    img.dataset.seated = '1';
    if(w/h >= COVER_MIN) return;
    var name = (img.getAttribute('src')||'').split('/').pop().split('?')[0];
    if(window.RELICTUM_FOCUS[name] !== undefined) return;
    img.style.objectFit = 'contain';
    var cell = img.parentElement;
    if(!cell || cell.querySelector('.gitem-blur')) return;
    var back = document.createElement('div');
    back.className = 'gitem-blur';
    back.style.cssText = 'position:absolute;inset:0;z-index:0;background:center/cover no-repeat;filter:blur(26px) saturate(1.05);transform:scale(1.18);opacity:.85';
    back.style.backgroundImage = 'url("'+(img.currentSrc||img.src)+'")';
    cell.insertBefore(back, img);
  }

  function scan(){
    document.querySelectorAll('.gallery .gitem img').forEach(function(img){
      if(img.complete) seat(img);
      else img.addEventListener('load', function(){ seat(img); }, {once:true});
    });
  }

  /* Галерею рисует клиентский рендер после разбора данных, поэтому одним
     проходом по готовому DOM не обойтись — ловим появление кадров наблюдателем. */
  if(document.readyState !== 'loading') scan();
  else document.addEventListener('DOMContentLoaded', scan);
  new MutationObserver(scan).observe(document.documentElement, {childList:true, subtree:true});
})();
