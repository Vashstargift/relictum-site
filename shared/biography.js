/* RELICTUM — «Биография объекта»: интерактивный таймлайн на промо-страницах.
   Требует shared/catalog.js (+ promo-data.js, если есть). Монтируется в элемент #bio-slot;
   id экспоната берёт из window.RL_BIO_ID, ?id= в адресе или первого «R–XXXX» на странице. */
(function(){
  function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }
  ready(function(){
    var slot=document.getElementById('bio-slot');
    if(!slot || !window.RELICTUM_CATALOG) return;
    var id=window.RL_BIO_ID;
    if(!id){ var q=new URLSearchParams(location.search).get('id');
      if(q){ var bySlug=window.RELICTUM_CATALOG.find(function(o){return o.slug===q||o.id===q}); if(bySlug) id=bySlug.id; } }
    if(!id){ var m=(document.body.textContent||'').match(/R–\d{4}/); if(m) id=m[0]; }
    var o=window.RELICTUM_CATALOG.find(function(x){return x.id===id});
    if(!o) return;
    var p=(window.RELICTUM_PROMO||{})[id]||{};

    /* стили — единожды */
    if(!document.getElementById('bio-css')){
      var st=document.createElement('style'); st.id='bio-css';
      st.textContent=
        '.bio-sec{background:#FBF8F1;border-top:1px solid rgba(143,101,48,.28);border-bottom:1px solid rgba(143,101,48,.28);padding:clamp(50px,7vw,90px) 0}'+
        '.bio-sec .bwrap{max-width:1120px;margin:0 auto;padding:0 clamp(18px,4.5vw,56px)}'+
        '.bio-label{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#9A6D34;text-align:center;display:block}'+
        '.bio-line{position:relative;height:2px;background:rgba(143,101,48,.28);margin:64px 8px 84px}'+
        '.bio-line .pt{position:absolute;top:50%;transform:translate(-50%,-50%);width:13px;height:13px;border-radius:50%;background:#F4F0E8;border:2px solid #8F6530;cursor:pointer;transition:.3s}'+
        '.bio-line .pt.on,.bio-line .pt:hover{background:#8F6530;box-shadow:0 0 12px rgba(143,101,48,.5)}'+
        '.bio-line .pt span{position:absolute;top:-42px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#5c554a}'+
        '.bio-line .pt i{position:absolute;top:22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:"Cormorant Garamond",serif;font-style:italic;font-size:13px;color:#8F6530}'+
        '.bio-card{max-width:560px;margin:0 auto;text-align:center;min-height:96px}'+
        '.bio-card b{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:21px;color:#14110E}'+
        '.bio-card p{margin-top:8px;font-size:14.5px;color:#5c554a;line-height:1.65}'+
        '@media(max-width:640px){.bio-line .pt span{display:none}}';
      document.head.appendChild(st);
    }

    var ageShort=(o.age||'').split(',')[0].trim();
    var aliveTitle=(p.alive&&p.alive.title)||(o.world==='cosmos'?'До Земли':'При жизни');
    var aliveText=(p.alive&&p.alive.text)||o.description||'';
    var findText=o.location||'Происхождение прослежено, данные в паспорте объекта.';
    var mountText=(o.mount?('Оформление: '+o.mount+'. '):'')+'Атрибуция дома, шифр '+o.id+', Паспорт объекта Relictum.';
    var steps=[
      {x:6, yr:ageShort||'—', t:aliveTitle, d:aliveText},
      {x:38,yr:'находка', t:'Находка', d:findText},
      {x:70,yr:'2026', t:'Дом Relictum', d:mountText},
      {x:94,yr:'—', t:'Вы', d:'Последняя строка биографии — за вами.'}
    ];

    slot.className='bio-sec';
    slot.innerHTML='<div class="bwrap"><span class="bio-label">Биография объекта</span>'+
      '<div class="bio-line"></div><div class="bio-card"></div></div>';
    var line=slot.querySelector('.bio-line'), card=slot.querySelector('.bio-card');
    steps.forEach(function(s,i){
      var pt=document.createElement('div'); pt.className='pt'; pt.style.left=s.x+'%';
      pt.innerHTML='<span>'+s.t+'</span><i>'+s.yr+'</i>';
      pt.onclick=function(){sel(i)}; line.appendChild(pt);
    });
    function sel(i){ var s=steps[i];
      card.innerHTML='<b>'+s.t+'</b><p>'+s.d+'</p>';
      [].forEach.call(line.querySelectorAll('.pt'),function(pt,k){pt.classList.toggle('on',k<=i)});
    }
    sel(0);
  });
})();
