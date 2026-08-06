/* RELICTUM — сборка и рендер полного печатного каталога реальной коллекции.
   Data-driven: экспонаты берутся из catalog_data.js. Генерирует
   catalog_collection_2026.html и рендерит RELICTUM_collection_2026.pdf.

   Запуск:  cd 07_product_presentations && node render_catalog_pdf.js
   Требует: playwright-core + Chromium. Онлайн-шрифты Google Fonts подхватываются;
   офлайн — передать локальный @font-face CSS через FONT_CSS_PATH.
   Добавить экспонат = дописать объект в catalog_data.js и перезапустить. */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { WORLDS, EXHIBITS } = require('./catalog_data.js');

const DIR = __dirname;
const QR = fs.readFileSync(path.join(DIR, 'qr_catalog.svg'), 'utf8');
const IMG = '../shared/img/';
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap');
:root{--ivory:#F4F0E8;--bone:#FBF8F1;--obsidian:#111;--bronze-deep:#9A6D34;--gold:#C9A96A;--stone:#7A7267;
--hairline:rgba(154,109,52,.28);--hairline-dark:rgba(201,169,106,.3);
--font-display:'Cormorant Garamond','Didot',serif;--font-ui:'Inter','Helvetica Neue',sans-serif;}
*{margin:0;padding:0;box-sizing:border-box;}
h1,h2,h3{font-family:var(--font-display);font-weight:400;}
@page{size:297mm 210mm;margin:0;}
body{font-family:var(--font-ui);font-weight:300;color:var(--obsidian);background:#333;}
img{display:block;}
.page{width:297mm;height:210mm;position:relative;overflow:hidden;background:var(--ivory);page-break-after:always;counter-increment:pg;margin:0 auto;}
@media screen{.page{margin:10px auto;box-shadow:0 2px 24px rgba(0,0,0,.35);}}
.label{font-family:var(--font-ui);font-size:8.2pt;font-weight:500;letter-spacing:.22em;text-transform:uppercase;}
.folio{position:absolute;bottom:8mm;left:16mm;right:16mm;display:flex;justify-content:space-between;align-items:baseline;font-size:7pt;letter-spacing:.2em;text-transform:uppercase;color:var(--stone);border-top:.3mm solid var(--hairline);padding-top:2.6mm;}
.folio .pgnum::after{content:counter(pg,decimal-leading-zero);}
.dark .folio{color:rgba(244,240,232,.55);border-top-color:var(--hairline-dark);}
.dark{background:#0B0A09;color:var(--ivory);}
.cover .bg,.divider .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.cover .veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%,rgba(0,0,0,0) 30%,rgba(0,0,0,.72) 100%),linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.5));}
.cover .inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18mm 20mm 14mm;text-align:center;}
.wordmark{font-family:var(--font-display);font-weight:400;letter-spacing:.5em;text-indent:.5em;}
.cover .wordmark{font-size:34pt;color:var(--ivory);}
.cover .slogan{font-size:8.5pt;letter-spacing:.48em;text-indent:.48em;color:var(--gold);text-transform:uppercase;margin-top:4mm;font-weight:400;}
.cover .bottom{font-size:8pt;letter-spacing:.34em;text-transform:uppercase;color:rgba(244,240,232,.78);}
.cover .edition{font-family:var(--font-display);font-style:italic;font-size:13pt;letter-spacing:.12em;color:rgba(244,240,232,.9);}
.manifest{display:grid;grid-template-columns:1.25fr 1fr;height:210mm;}
.manifest .left{padding:20mm 14mm 24mm 16mm;display:flex;flex-direction:column;justify-content:center;}
.manifest h1{font-size:33pt;line-height:1.1;margin:6mm 0 7mm;}
.manifest h1 em{font-style:italic;color:var(--bronze-deep);}
.manifest .lede{font-family:var(--font-display);font-size:13.5pt;line-height:1.5;color:#3d3830;max-width:62ch;}
.manifest .lede+.lede{margin-top:4mm;}
.manifest .right{border-left:.3mm solid var(--hairline);padding:20mm 16mm 24mm 12mm;display:flex;flex-direction:column;justify-content:center;gap:6mm;background:var(--bone);}
.pillar{border-top:.3mm solid var(--hairline);padding-top:3.4mm;}
.pillar:first-child{border-top:none;padding-top:0;}
.pillar .num{font-family:var(--font-display);font-size:10.5pt;color:var(--bronze-deep);letter-spacing:.12em;}
.pillar b{font-family:var(--font-display);font-weight:500;font-size:14pt;display:block;margin:1mm 0 1.4mm;}
.pillar p{font-size:8.6pt;line-height:1.55;color:var(--stone);}
.toc{padding:12mm 16mm 18mm;}
.toc h1{font-size:24pt;margin:1.5mm 0 4mm;}
.toc-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:7mm;}
.toc-col .wt{font-family:var(--font-display);font-size:13pt;color:var(--bronze-deep);border-bottom:.3mm solid var(--hairline);padding-bottom:1.6mm;margin-bottom:2.4mm;}
.toc-row{display:flex;justify-content:space-between;gap:5mm;padding:1.0mm 0;border-bottom:.25mm solid rgba(154,109,52,.14);}
.toc-row .nm{font-size:8pt;line-height:1.16;}
.toc-row .nm i{font-family:var(--font-display);font-style:italic;font-size:7.4pt;color:var(--bronze-deep);display:block;}
.toc-row .rid{font-size:6.8pt;letter-spacing:.14em;color:var(--stone);white-space:nowrap;padding-top:.6mm;}
.divider .veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.25) 55%,rgba(0,0,0,.05) 100%);}
.divider .inner{position:absolute;left:16mm;bottom:22mm;max-width:130mm;}
.divider .kicker{color:var(--gold);}
.divider h1{font-size:40pt;color:var(--ivory);margin:3mm 0;}
.divider p{font-family:var(--font-display);font-style:italic;font-size:13pt;line-height:1.45;color:rgba(244,240,232,.85);}
.exhibit{display:grid;grid-template-columns:128mm 1fr;grid-template-rows:100%;height:100%;}
.exhibit .photo{position:relative;background:#EFEAE0;height:210mm;}
.exhibit .photo img{width:100%;height:100%;object-fit:cover;}
.exhibit .photo.prov::after{content:'Рабочее фото · студийная съёмка готовится';position:absolute;left:0;bottom:0;right:0;font-family:var(--font-ui);font-size:6.6pt;letter-spacing:.16em;text-transform:uppercase;color:var(--ivory);background:rgba(11,10,9,.62);padding:2.4mm 6mm;}
.exhibit .body{padding:16mm 16mm 24mm 12mm;display:flex;flex-direction:column;}
.exhibit .kicker{color:var(--bronze-deep);}
.exhibit h1{font-size:24pt;line-height:1.08;margin:3mm 0 1mm;}
.exhibit .latin{font-family:var(--font-display);font-style:italic;font-size:13pt;color:var(--bronze-deep);margin-bottom:4mm;}
.exhibit .hook{font-family:var(--font-display);font-style:italic;font-size:12.5pt;line-height:1.42;color:#3d3830;border-top:.3mm solid var(--hairline);padding-top:3.6mm;margin-bottom:3.6mm;}
.exhibit .desc{font-size:9pt;line-height:1.62;color:#34302a;margin-bottom:5mm;max-width:66ch;}
.passport{border-top:.3mm solid var(--hairline);}
.passport .row{display:grid;grid-template-columns:36mm 1fr;border-bottom:.3mm solid var(--hairline);padding:2.3mm 0;}
.passport .k{font-size:7pt;letter-spacing:.18em;text-transform:uppercase;color:var(--stone);padding-top:.6mm;}
.passport .v{font-size:9.2pt;}
.exhibit .price{font-family:var(--font-display);font-size:17pt;margin-top:auto;padding-top:6mm;}
.exhibit .price small{font-family:var(--font-ui);font-size:7.4pt;letter-spacing:.06em;color:var(--stone);display:block;margin-top:1mm;}
.alive{display:grid;grid-template-columns:1fr 116mm;grid-template-rows:100%;height:100%;background:#0B0A09;color:var(--ivory);}
.alive .visual{position:relative;height:210mm;}
.alive .visual img{width:100%;height:100%;object-fit:cover;}
.alive .visual .shade{position:absolute;inset:0;background:linear-gradient(270deg,rgba(11,10,9,.85) 0%,rgba(11,10,9,0) 30%);}
.alive .body{padding:16mm 16mm 24mm 12mm;display:flex;flex-direction:column;}
.alive .kicker{color:var(--gold);}
.alive h2{font-size:21pt;line-height:1.12;margin:3mm 0 4mm;}
.alive .story p{font-size:8.8pt;line-height:1.66;color:rgba(244,240,232,.86);margin-bottom:3.4mm;}
.alive .era{border-top:.3mm solid var(--hairline-dark);padding-top:3mm;}
.alive .era b{font-family:var(--font-display);font-weight:500;font-size:12.5pt;display:block;}
.alive .era span{font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(244,240,232,.6);}
.alive .home{display:grid;grid-template-columns:34mm 1fr;gap:4mm;align-items:center;margin-top:auto;padding-top:5mm;}
.alive .home img{width:100%;height:24mm;object-fit:cover;}
.alive .home .cap{font-size:7pt;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);margin-bottom:1.4mm;}
.alive .home p{font-size:7.8pt;line-height:1.5;color:rgba(244,240,232,.75);}
.services{padding:18mm 16mm 24mm;}
.services h1{font-size:26pt;margin:2mm 0 3mm;}
.services .dek{font-family:var(--font-display);font-style:italic;font-size:13pt;color:var(--stone);margin-bottom:9mm;}
.svc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7mm;}
.svc{border-top:.3mm solid var(--hairline);padding-top:4mm;}
.svc .num{font-family:var(--font-display);font-size:11pt;color:var(--bronze-deep);}
.svc b{font-family:var(--font-display);font-weight:500;font-size:14.5pt;display:block;margin:1.6mm 0 2mm;}
.svc p{font-size:8.6pt;line-height:1.6;color:var(--stone);}
.svc-photos{display:grid;grid-template-columns:repeat(4,1fr);gap:7mm;margin-top:8mm;}
.svc-photos img{width:100%;height:46mm;object-fit:cover;}
.final{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:5mm;height:210mm;}
.final .wordmark{font-size:26pt;}
.final .slogan{font-size:8pt;letter-spacing:.44em;text-indent:.44em;color:var(--gold);text-transform:uppercase;}
.final .contact{font-family:var(--font-display);font-size:13pt;line-height:1.7;color:rgba(244,240,232,.9);}
.final .qr{width:26mm;height:26mm;margin-top:3mm;}
.final .qr svg{width:100%;height:100%;}
.final .note{font-size:7.4pt;letter-spacing:.22em;text-transform:uppercase;color:rgba(244,240,232,.5);margin-top:2mm;}
`;

const romans = ['I','II','III','IV','V','VI'];

function coverPage(){
  return `<section class="page dark cover"><img class="bg" src="${IMG}still_black_tusks.jpg" alt="">
  <div class="veil"></div><div class="inner">
    <div><div class="wordmark">RELICTUM</div><div class="slogan">Роскошь вне времени</div></div>
    <div><div class="edition">Каталог коллекции · MMXXVI</div><div class="bottom" style="margin-top:4mm">Земля · Жизнь · Космос</div></div>
  </div></section>`;
}
function manifestPage(){
  return `<section class="page manifest">
    <div class="left"><div class="label" style="color:var(--bronze-deep)">Дом редких природных артефактов</div>
      <h1>Вещи, которые старше<br>любой <em>роскоши</em></h1>
      <p class="lede">RELICTUM собирает редчайшие свидетельства глубокого времени — скелеты динозавров, бивни мамонтов, метеориты и минералы — и превращает их в законченные объекты для дома, кабинета и коллекции.</p>
      <p class="lede">Каждый экспонат в этом каталоге существует в единственном экземпляре, находится в наличии и передаётся с полным паспортом происхождения. Это подлинники, возраст которых измеряется миллионами лет.</p></div>
    <div class="right">
      <div class="pillar"><div class="num">I</div><b>Подлинность</b><p>Каждый объект сопровождается паспортом: экспертиза, легальное происхождение, научное описание.</p></div>
      <div class="pillar"><div class="num">II</div><b>Готовый объект, а не находка</b><p>Оформление и постамент проектируются под экспонат: бронза, мрамор, стекло.</p></div>
      <div class="pillar"><div class="num">III</div><b>Передача</b><p>Деревянный ящик, страховка на время пути, доставка и установка нашей командой.</p></div>
    </div></section>`;
}
function tocPage(){
  const cols = WORLDS.map(w=>{
    const rows = EXHIBITS.filter(e=>e.world===w.key).map(e=>
      `<div class="toc-row"><div class="nm">${esc(e.name)}<i>${esc(e.latin)}</i></div><div class="rid">${esc(e.id)}</div></div>`).join('');
    return `<div class="toc-col"><div class="wt">${esc(w.title)}</div>${rows}</div>`;
  }).join('');
  return `<section class="page toc"><div class="label" style="color:var(--bronze-deep)">В наличии · единственные экземпляры</div>
    <h1>Коллекция</h1><div class="toc-cols">${cols}</div>
    <div class="folio"><span>Relictum · Каталог коллекции</span><span>Все объекты — цена по запросу</span><span class="pgnum"></span></div></section>`;
}
function dividerPage(w,i){
  return `<section class="page dark divider"><img class="bg" src="${IMG}${w.divider}" alt=""><div class="veil"></div>
    <div class="inner"><div class="label kicker">Раздел ${romans[i]}</div><h1>${esc(w.title)}</h1><p>${esc(w.blurb)}</p></div></section>`;
}
function passportPage(e,worldTitle){
  const rows = e.rows.map(r=>`<div class="row"><div class="k">${esc(r[0])}</div><div class="v">${esc(r[1])}</div></div>`).join('');
  return `<section class="page exhibit">
    <div class="photo${e.prov?' prov':''}"><img src="${IMG}${e.photo}.jpg" alt="${esc(e.name)}"></div>
    <div class="body">
      <div class="label kicker">${esc(e.id)} · ${esc(e.kicker)}</div>
      <h1>${esc(e.name)}</h1><div class="latin">${esc(e.latin)}</div>
      <p class="hook">${esc(e.hook)}</p><p class="desc">${esc(e.desc)}</p>
      <div class="passport">${rows}</div>
      <div class="price">Цена по запросу<small>Включая оформление, футляр, документы и бережную доставку</small></div>
      <div class="folio" style="left:12mm"><span>Relictum · ${esc(worldTitle)}</span><span class="pgnum"></span></div>
    </div></section>`;
}
function alivePage(e){
  const a=e.alive;
  const story=a.story.map(p=>`<p>${esc(p)}</p>`).join('');
  return `<section class="page alive">
    <div class="visual"><img src="${IMG}${a.still}" alt=""><div class="shade"></div></div>
    <div class="body"><div class="label kicker">${e.world==='cosmos'?'До Земли':'При жизни'}</div><h2>${esc(a.title)}</h2>
      <div class="story">${story}</div>
      <div class="era"><span>Эпоха</span><b>${esc(a.era)}</b></div>
      <div class="home"><img src="${IMG}${a.home}" alt=""><div><div class="cap">В вашем доме</div><p>${esc(a.homeText)}</p></div></div>
      <div class="folio" style="left:12mm"><span>${esc(e.latin)}</span><span class="pgnum"></span></div>
    </div></section>`;
}
function servicePage(){
  return `<section class="page services"><div class="label" style="color:var(--bronze-deep)">Дом Relictum</div>
    <h1>Как мы работаем</h1><p class="dek">От первого запроса до установленного экспоната — путь, который дом проходит вместе с вами.</p>
    <div class="svc-grid">
      <div class="svc"><div class="num">01</div><b>Провенанс</b><p>Экспертиза подлинности, легальное происхождение, научное описание. Паспорт объекта и сертификат дома.</p></div>
      <div class="svc"><div class="num">02</div><b>Ателье</b><p>Оформление, постамент и витрина проектируются под экспонат: бронза, мрамор, музейное стекло, скрытый крепёж.</p></div>
      <div class="svc"><div class="num">03</div><b>Передача</b><p>Деревянный ящик, страховка, доставка и монтаж нашей командой — в Москве, по России и миру.</p></div>
      <div class="svc"><div class="num">04</div><b>Персональный поиск</b><p>Не нашли свой объект? Консьерж дома ищет экспонаты под запрос — от зуба до полного скелета.</p></div>
    </div>
    <div class="svc-photos"><img src="${IMG}prov_kit_flatlay.jpg" alt=""><img src="${IMG}mount_bronze_cradle.jpg" alt=""><img src="${IMG}pack_leather_box_open.jpg" alt=""><img src="${IMG}concierge_tray.jpg" alt=""></div>
    <div class="folio"><span>Relictum · Сервис дома</span><span class="pgnum"></span></div></section>`;
}
function finalPage(){
  return `<section class="page dark final"><div class="wordmark">RELICTUM</div><div class="slogan">Роскошь вне времени</div>
    <div class="contact">concierge@relictum.ru<br>+7 900 000-00-00<br>vashikmart.github.io/relictum</div>
    <div class="qr">${QR}</div><div class="note">Наведите камеру — каталог и видео экспонатов онлайн</div></section>`;
}

// сборка
let body = coverPage() + manifestPage() + tocPage();
WORLDS.forEach((w,i)=>{
  body += dividerPage(w,i);
  EXHIBITS.filter(e=>e.world===w.key).forEach(e=>{
    body += passportPage(e,w.title);
    if(e.alive) body += alivePage(e);
  });
});
body += servicePage() + finalPage();

const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>RELICTUM — Каталог коллекции · 2026</title>
<meta name="description" content="Печатный каталог реальной коллекции RELICTUM: метеориты, ископаемая жизнь и монументы. Роскошь вне времени.">
<style>${CSS}</style></head><body>${body}</body></html>`;

fs.writeFileSync(path.join(DIR,'catalog_collection_2026.html'), html);

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto('file://'+path.join(DIR,'catalog_collection_2026.html'), { waitUntil:'load', timeout:90000 });
  if (process.env.FONT_CSS_PATH) await page.addStyleTag({ content: fs.readFileSync(process.env.FONT_CSS_PATH,'utf8') });
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.pdf({ path: path.join(DIR,'RELICTUM_collection_2026.pdf'), width:'297mm', height:'210mm', printBackground:true, preferCSSPageSize:true, margin:{top:0,bottom:0,left:0,right:0} });
  const n = EXHIBITS.length, spreads = EXHIBITS.filter(e=>e.alive).length;
  console.log(`OK · экспонатов ${n} · alive-разворотов ${spreads}`);
  await browser.close();
})();
