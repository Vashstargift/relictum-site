/* RELICTUM — магазинный слой (корзина + избранное + кабинет).
   Статический фронтенд-прототип на localStorage. Требует shared/catalog.js.
   Подключать ПОСЛЕ catalog.js. Сам встраивает бейджи корзины/избранного/кабинета в .nav-actions. */
(function(){
  var CART_KEY='relictum_cart', FAV_KEY='relictum_favs', USER_KEY='relictum_user';

  function read(k){ try{return JSON.parse(localStorage.getItem(k))||[]}catch(e){return []} }
  function write(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){} emit(); }
  function readObj(k){ try{return JSON.parse(localStorage.getItem(k))||null}catch(e){return null} }

  function catalog(){ return window.RELICTUM_CATALOG||[]; }
  function item(id){ return catalog().find(function(o){return o.id===id||o.slug===id})||null; }

  var Shop={
    getCart:function(){ return read(CART_KEY); },
    getFavs:function(){ return read(FAV_KEY); },
    inCart:function(id){ return this.getCart().indexOf(id)>=0; },
    inFav:function(id){ return this.getFavs().indexOf(id)>=0; },
    count:function(){ return this.getCart().length; },
    favCount:function(){ return this.getFavs().length; },
    item:item,
    cartItems:function(){ return this.getCart().map(item).filter(Boolean); },
    favItems:function(){ return this.getFavs().map(item).filter(Boolean); },
    addToCart:function(id){ var c=read(CART_KEY); if(c.indexOf(id)<0){c.push(id);write(CART_KEY,c);} },
    removeFromCart:function(id){ write(CART_KEY, read(CART_KEY).filter(function(x){return x!==id})); },
    clearCart:function(){ write(CART_KEY,[]); },
    toggleFav:function(id){ var f=read(FAV_KEY); var i=f.indexOf(id); if(i<0)f.push(id); else f.splice(i,1); write(FAV_KEY,f); return f.indexOf(id)>=0; },
    total:function(){ return this.cartItems().reduce(function(s,o){return s+(o.priceValue||0)},0); },
    hasRequestItems:function(){ return this.cartItems().some(function(o){return o.priceValue==null}); },
    /* пользователь (демо-кабинет) */
    user:function(){
      var u=readObj(USER_KEY);
      if(!u){
        u={ name:'Гость', email:'', phone:'', manager:'Ирина Вологдина', managerRole:'Персональный консультант дома',
            since:'2026', purchased:[], interests:[], registered:false };
        localStorage.setItem(USER_KEY,JSON.stringify(u));
      }
      if(u.registered===undefined) u.registered=false;
      return u;
    },
    /* Патрон дома — тот, кто оставил свои данные. До этого кабинет показывает
       приглашение вступить, а не выдуманную коллекцию. */
    isPatron:function(){ return !!this.user().registered; },
    registerPatron:function(d){
      var u=this.user();
      u.name=d.name||u.name; u.email=d.email||u.email; u.phone=d.phone||u.phone;
      u.registered=true; u.since=String(new Date().getFullYear());
      this.saveUser(u); return u;
    },
    signOut:function(){ localStorage.removeItem(USER_KEY); emit(); },
    saveUser:function(u){ localStorage.setItem(USER_KEY,JSON.stringify(u)); emit(); },
    /* оформленный заказ переносит товары в "коллекцию" */
    placeOrder:function(){
      var u=this.user(); var ids=this.getCart();
      u.purchased=(u.purchased||[]).concat(ids.filter(function(x){return u.purchased.indexOf(x)<0}));
      this.saveUser(u); this.clearCart();
      return ids;
    },
    /* ценовой статус/скидка по сумме коллекции */
    tier:function(){
      var spent=(this.user().purchased||[]).map(item).filter(Boolean).reduce(function(s,o){return s+(o.priceValue||0)},0);
      if(spent>=5000000) return {name:'Обсидиан',discount:12,spent:spent};
      if(spent>=2000000) return {name:'Бронза',discount:8,spent:spent};
      if(spent>=500000)  return {name:'Патрон',discount:5,spent:spent};
      return {name:'Гость дома',discount:0,spent:spent};
    },
    fmt:function(v){ return v==null?'Цена по запросу':(v.toLocaleString('ru-RU')+' ₽'); },
    /* экранирование пользовательского ввода перед вставкой в HTML/атрибуты (защита от self-XSS) */
    esc:function(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); },
    /* заявки и заказы (демо-CRM; в бою — на сервере) */
    getOrders:function(){ try{return JSON.parse(localStorage.getItem('relictum_orders'))||[]}catch(e){return[]} },
    addOrder:function(rec){ var a=this.getOrders(); a.unshift(rec); localStorage.setItem('relictum_orders',JSON.stringify(a)); },
    getLeads:function(){ try{return JSON.parse(localStorage.getItem('relictum_leads'))||[]}catch(e){return[]} },
    addLead:function(rec){ var a=this.getLeads(); a.unshift(rec); localStorage.setItem('relictum_leads',JSON.stringify(a)); },
    /* Отправка на сервер: локальная копия остаётся у посетителя (кабинет,
       история заказов), но теперь письмо уходит и в дом. Ошибка сети не должна
       ломать сценарий — интерфейс уже показал подтверждение. */
    send:function(kind,rec){
      try{
        var url=(location.pathname.indexOf('/objects/')>=0?'../':'')+'send.php';
        return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({kind:kind,page:location.href,data:rec})}).catch(function(){});
      }catch(e){}
    }
  };
  window.RelictumShop=Shop;

  /* ---- бейджи в навигации ---- */
  function badge(href,label,icon,count){
    var extra=count>0?'<i class="rl-badge">'+count+'</i>':'';
    return '<a class="rl-navlink" href="'+href+'" aria-label="'+label+'">'+icon+extra+'</a>';
  }
  function paths(){
    // определяем префикс к 02_site_v1_gallery
    var p=location.pathname;
    if(p.indexOf('/02_site_v1_gallery/')>=0) return '';
    if(p.indexOf('/16_product_promos/')>=0) return '../02_site_v1_gallery/';
    return '02_site_v1_gallery/';
  }
  function render(){
    var pre=paths();
    /* Иконки дома: тонкая гравюрная линия, геометрия «кабинета редкостей».
       Звезда-роза ветров — отмеченное, экспедиционный ящик — корзина, ключ — кабинет. */
    var star='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M12 2.6l2.1 6.05 6.3.35-4.9 3.95 1.65 6.1L12 15.6l-5.15 3.45 1.65-6.1-4.9-3.95 6.3-.35z"/></svg>';
    var crate='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"><path d="M3.6 7.4h16.8v12.2H3.6z"/><path d="M3.6 11h16.8"/><path d="M9.4 7.4V4.4h5.2v3"/></svg>';
    // Кабинет: силуэт человека. Прежний «ключ» в шапке путался с лупой поиска —
    // круг со скошенным стержнем читается одинаково при 17px.
    var key='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.4" r="3.6"/><path d="M5.4 19.4c0-3.4 3-5.5 6.6-5.5s6.6 2.1 6.6 5.5"/></svg>';
    var html=
      badge(pre+'account.html#favorites','Избранное',star,Shop.favCount())+
      badge(pre+'cart.html','Корзина',crate,Shop.count())+
      badge(pre+'account.html','Личный кабинет',key,0);
    document.querySelectorAll('.nav-actions').forEach(function(na){
      var wrap=na.querySelector('.rl-shopnav');
      if(!wrap){ wrap=document.createElement('span'); wrap.className='rl-shopnav'; na.appendChild(wrap); }
      wrap.innerHTML=html;
    });
    // промо-страницы (.top бар)
    document.querySelectorAll('.top').forEach(function(t){
      if(t.querySelector('.rl-shopnav'))  t.querySelector('.rl-shopnav').innerHTML=html;
    });
  }
  function emit(){ try{render()}catch(e){} }

  /* стили бейджей + тост */
  var css='.rl-shopnav{display:inline-flex;gap:14px;align-items:center;margin-left:16px}'+
    '.rl-navlink{position:relative;color:inherit;display:inline-flex;opacity:.85;transition:opacity .3s}'+
    '.rl-navlink:hover{opacity:1}'+
    '.rl-badge{position:absolute;top:-7px;right:-9px;background:#B08A55;color:#0A0908;font-family:Inter,sans-serif;font-style:normal;font-size:9px;font-weight:600;min-width:15px;height:15px;line-height:15px;text-align:center;border-radius:8px;padding:0 3px}'+
    '.rl-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:#14110E;color:#F4F0E8;padding:14px 24px;font-family:Inter,sans-serif;font-size:13px;letter-spacing:.04em;border:1px solid rgba(176,138,85,.4);opacity:0;transition:.4s cubic-bezier(.23,1,.32,1);z-index:9999;pointer-events:none}'+
    '.rl-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  var toastEl;
  Shop.toast=function(msg){
    if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='rl-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent=msg; toastEl.classList.add('on');
    clearTimeout(toastEl._t); toastEl._t=setTimeout(function(){toastEl.classList.remove('on')},2200);
  };

  if(document.readyState!=='loading') render();
  else document.addEventListener('DOMContentLoaded',render);
})();

/* ---- Лайтбокс: клик по фото экспоната открывает снимок целиком ---- */
(function(){
  /* .gallery .gitem img намеренно НЕ здесь: у страницы экспоната свой лайтбокс
     (открывает полный кадр по data-full); двойной попап перекрывал крестики. */
  /* .media img — контентные фото витрины (экспедиции, дом, интерьеры, журнал):
     любые из них открываются на весь экран; фото внутри ссылок-карточек
     лайтбокс пропускает (см. проверку closest('a') ниже). */
  var SEL = '.object-gallery .main img, .object-gallery .thumbs img, .hero .ph img, .ex-gallery img, .gal img, .obj-card .ph img, .media img';
  var box, pic;
  function build(){
    box = document.createElement('div');
    box.className = 'rl-lightbox';
    box.innerHTML = '<button class="rl-lb-close" aria-label="Закрыть">×</button><img alt="">';
    pic = box.querySelector('img');
    box.addEventListener('click', close);
    document.body.appendChild(box);
    var st = document.createElement('style');
    st.textContent =
      '.rl-lightbox{position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;' +
      'background:rgba(10,9,8,.92);backdrop-filter:blur(6px);cursor:zoom-out;padding:clamp(16px,4vw,56px)}' +
      '.rl-lightbox.on{display:flex}' +
      '.rl-lightbox img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 40px 120px -40px rgba(0,0,0,.9)}' +
      '.rl-lb-close{position:absolute;top:18px;right:22px;width:44px;height:44px;border:none;background:transparent;' +
      'color:#F4F0E8;font-size:30px;line-height:1;cursor:pointer;font-family:inherit}' +
      '.rl-lb-close:hover{color:#E9C98A}' +
      '.media img{cursor:zoom-in}a .media img{cursor:pointer}' +
      'body.rl-lb-open{overflow:hidden}';
    document.head.appendChild(st);
  }
  function open(src, alt){
    if(!box) build();
    pic.src = src; pic.alt = alt || '';
    box.classList.add('on'); document.body.classList.add('rl-lb-open');
  }
  function close(){ if(box){ box.classList.remove('on'); document.body.classList.remove('rl-lb-open'); } }
  addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
  /* bfcache: «назад» восстанавливает страницу с открытым лайтбоксом */
  addEventListener('pageshow', close);
  addEventListener('click', function(e){
    var img = e.target.closest && e.target.closest(SEL);
    if(!img || (box && box.contains(img))) return;
    if(img.closest('a')) return;              /* карточки-ссылки открывают страницу, не лайтбокс */
    e.preventDefault();
    open(img.currentSrc || img.src, img.alt);
  });
})();

/* ---- Плавающий контакт (по образцу StarGift): кнопка снизу справа,
        попап — подбор, WhatsApp, телефон и обратный звонок в CRM ---- */
(function(){
  var S = window.RelictumShop; if(!S) return;
  /* те же три строки, что в paths(): билдер публичного среза переписывает их
     под раскладку домена, поэтому дублируем дословно */
  function pre(){
    var p=location.pathname;
    if(p.indexOf('/02_site_v1_gallery/')>=0) return '';
    if(p.indexOf('/16_product_promos/')>=0) return '../02_site_v1_gallery/';
    return '02_site_v1_gallery/';
  }
  var P = pre();
  var PHONE_H='+7 495 233 5111', PHONE='+74952335111', WA='https://wa.me/74952335111', TG='https://t.me/stargiftgallerybot';

  var st=document.createElement('style');
  st.textContent =
    /* bottom 96px: угол справа внизу занимает браузерная стрелка «наверх»
       (Яндекс.Браузер и др.) — кнопка дома живёт над ней */
    '.rl-fab{position:fixed;right:22px;bottom:96px;z-index:220;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;'+
      'background:#14110E;color:#F4F0E8;display:flex;align-items:center;justify-content:center;'+
      'box-shadow:0 10px 30px -8px rgba(10,9,8,.55);transition:transform .25s,background .25s}'+
    '.rl-fab:hover{transform:scale(1.06);background:#0A0908}'+
    '.rl-cpop{position:fixed;right:22px;bottom:164px;z-index:220;width:min(320px,calc(100vw - 32px));'+
      'background:#FBF8F1;border:1px solid rgba(154,109,52,.28);box-shadow:0 30px 80px -20px rgba(10,9,8,.45);'+
      'opacity:0;transform:translateY(14px);pointer-events:none;transition:opacity .25s,transform .25s}'+
    '.rl-cpop.on{opacity:1;transform:none;pointer-events:auto}'+
    '.rl-cpop .h{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(154,109,52,.18)}'+
    '.rl-cpop .h b{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#9A6D34;font-weight:500}'+
    '.rl-cpop .h button{background:none;border:none;cursor:pointer;font-size:18px;line-height:1;color:#7A7267;padding:2px 4px}'+
    '.rl-cpop .row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid rgba(154,109,52,.1);'+
      'color:#14110E;font-size:14px;cursor:pointer;background:none;border-left:none;border-right:none;border-top:none;width:100%;text-align:left;font-family:inherit;transition:background .25s}'+
    'a.rl-crow{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid rgba(154,109,52,.1);color:#14110E;font-size:14px;transition:background .25s}'+
    '.rl-cpop .row:hover,a.rl-crow:hover{background:rgba(154,109,52,.07)}'+
    '.rl-cpop .ic{width:36px;height:36px;border-radius:50%;background:rgba(154,109,52,.1);display:flex;align-items:center;justify-content:center;flex:none;color:#9A6D34}'+
    '.rl-cpop form{padding:18px 20px}'+
    '.rl-cpop form p{font-size:12.5px;color:#7A7267;margin:0 0 12px;line-height:1.5}'+
    '.rl-cpop input[type=text],.rl-cpop input[type=tel]{width:100%;font-size:16px;font-family:inherit;padding:11px 2px;margin-bottom:10px;'+
      'background:transparent;border:none;border-bottom:1px solid rgba(20,17,14,.22);outline:none}'+
    '.rl-cpop label.cns{display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#7A7267;line-height:1.45;margin:8px 0 14px}'+
    '.rl-cpop label.cns a{color:inherit;text-decoration:underline}'+
    '.rl-cpop .go{width:100%;padding:13px 0;background:#14110E;color:#F4F0E8;border:none;cursor:pointer;'+
      'font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;font-family:inherit}'+
    '.rl-cpop .back{width:100%;padding:9px 0 2px;background:none;border:none;cursor:pointer;font-size:11px;color:#7A7267;font-family:inherit}'+
    '.rl-cpop .ok{padding:26px 20px;text-align:center;font-size:14px;color:#14110E}'+
    '.rl-cpop .ok small{display:block;margin-top:8px;font-size:12px;color:#7A7267}'+
    '@media(max-width:720px){.rl-fab{right:16px;bottom:calc(88px + env(safe-area-inset-bottom,0px))}.rl-cpop{right:16px;bottom:calc(156px + env(safe-area-inset-bottom,0px))}}';
  document.head.appendChild(st);

  var icoChat='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.6-.8L3 20l1-4.2a8.3 8.3 0 0 1-1-4.3 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z"/></svg>';
  var icoX='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var icoStar='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M12 2.6l2.1 6.05 6.3.35-4.9 3.95 1.65 6.1L12 15.6l-5.15 3.45 1.65-6.1-4.9-3.95 6.3-.35z"/></svg>';
  var icoWa='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.004 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
  var icoTel='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var icoTg='<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';
  var icoBack='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  function menuHTML(){
    return '<div class="h"><b>Связаться с домом</b><button type="button" data-c aria-label="Закрыть">'+icoX+'</button></div>'+
      '<a class="rl-crow" href="'+P+'request.html"><span class="ic">'+icoStar+'</span><span>Персональный подбор</span></a>'+
      '<a class="rl-crow" href="'+WA+'" target="_blank" rel="noopener"><span class="ic">'+icoWa+'</span><span>WhatsApp</span></a>'+
      '<a class="rl-crow" href="'+TG+'" target="_blank" rel="noopener"><span class="ic">'+icoTg+'</span><span>Telegram</span></a>'+
      '<a class="rl-crow" href="tel:'+PHONE+'"><span class="ic">'+icoTel+'</span><span>'+PHONE_H+'</span></a>'+
      '<button type="button" class="row" data-cb><span class="ic">'+icoBack+'</span><span>Обратный звонок</span></button>';
  }
  function formHTML(about){
    var u=S.user();
    return '<div class="h"><b>'+(about?'Запрос объекта':'Обратный звонок')+'</b><button type="button" data-c aria-label="Закрыть">'+icoX+'</button></div>'+
      '<form data-f><p>'+(about?S.esc(about)+'. ':'')+'Оставьте номер — наш менеджер свяжется с вами в течение 15 минут после обращения.</p>'+
      '<input type="hidden" name="about" value="'+S.esc(about||'')+'">'+
      '<input type="text" name="name" placeholder="Имя" value="'+S.esc(u.name==='Гость'?'':u.name)+'" required>'+
      '<input type="tel" name="phone" placeholder="+7 (___) ___-__-__" value="'+S.esc(u.phone||'')+'" required>'+
      '<label class="cns"><input type="checkbox" name="consent" required style="margin-top:2px">'+
        '<span>Я предоставляю своё <a href="'+P+'consent.html" target="_blank">согласие на обработку персональных данных</a> в соответствии с <a href="'+P+'privacy.html" target="_blank">политикой конфиденциальности</a></span></label>'+
      '<button class="go" type="submit">Жду звонка</button>'+
      '<button class="back" type="button" data-b>&#8592; Назад</button></form>';
  }
  function okHTML(name){
    return '<div class="h"><b>Заявка принята</b><button type="button" data-c aria-label="Закрыть">'+icoX+'</button></div>'+
      '<div class="ok">Спасибо'+(name?(', '+S.esc(name.split(' ')[0])):'')+'.<small>Наш менеджер свяжется с вами в течение 15 минут после обращения.</small></div>';
  }

  var fab=document.createElement('button');
  fab.className='rl-fab'; fab.type='button'; fab.setAttribute('aria-label','Связаться с домом');
  fab.innerHTML=icoChat;
  var pop=document.createElement('div');
  pop.className='rl-cpop'; pop.innerHTML=menuHTML();
  document.body.appendChild(pop); document.body.appendChild(fab);

  function close(){ pop.classList.remove('on'); fab.innerHTML=icoChat; setTimeout(function(){ pop.innerHTML=menuHTML(); },250); }
  function open(){ pop.classList.add('on'); fab.innerHTML=icoX; }
  fab.addEventListener('click', function(){ pop.classList.contains('on')?close():open(); });
  /* «Запросить объект» на промо-страницах открывает форму с именем лота */
  window.RL_ASK=function(about){ pop.innerHTML=formHTML(about); open(); };
  /* значок связи в шапке открывает тот же попап (без JS уводит на #concierge) */
  document.querySelectorAll('.rl-nav-contact').forEach(function(el){
    el.addEventListener('click', function(e){ e.preventDefault(); pop.classList.contains('on')?close():open(); });
  });
  document.addEventListener('mousedown', function(e){
    if(pop.classList.contains('on') && !pop.contains(e.target) && !fab.contains(e.target) && !e.target.closest('.rl-nav-contact')) close();
  });
  addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });

  pop.addEventListener('click', function(e){
    if(e.target.closest('[data-c]')) { close(); return; }
    if(e.target.closest('[data-cb]')) { pop.innerHTML=formHTML(); return; }
    if(e.target.closest('[data-b]')) { pop.innerHTML=menuHTML(); return; }
  });
  pop.addEventListener('submit', function(e){
    var f=e.target.closest('[data-f]'); if(!f) return;
    e.preventDefault();
    if(!f.checkValidity()){ f.reportValidity(); return; }
    var fd=new FormData(f), name=fd.get('name')||'', phone=fd.get('phone')||'';
    var u=S.user(); if(name)u.name=name; if(phone)u.phone=phone; S.saveUser(u);
    var about=fd.get('about')||'';
    var rec={date:new Date().toLocaleString('ru-RU'),type:about?('Запрос объекта: '+about):'Обратный звонок',name:name,phone:phone,contact:phone,consent:true};
    if(about) rec.about=about;
    S.addLead(rec); S.send(about?'запрос объекта':'обратный звонок', rec);
    pop.innerHTML=okHTML(name);
  });
})();
