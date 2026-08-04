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
            since:'2026', purchased:[], interests:[] };
        localStorage.setItem(USER_KEY,JSON.stringify(u));
      }
      return u;
    },
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
    addLead:function(rec){ var a=this.getLeads(); a.unshift(rec); localStorage.setItem('relictum_leads',JSON.stringify(a)); }
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
    var key='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.4" cy="8.4" r="4"/><path d="M11.3 11.3L20 20"/><path d="M17.2 17.2l-2 2"/><path d="M14.6 14.6l-1.7 1.7"/></svg>';
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
  var SEL = '.object-gallery .main img, .object-gallery .thumbs img, .ex-gallery img, .gal img, .obj-card .ph img';
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
  addEventListener('click', function(e){
    var img = e.target.closest && e.target.closest(SEL);
    if(!img || (box && box.contains(img))) return;
    if(img.closest('a')) return;              /* карточки-ссылки открывают страницу, не лайтбокс */
    e.preventDefault();
    open(img.currentSrc || img.src, img.alt);
  });
})();
