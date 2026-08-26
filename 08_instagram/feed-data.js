/* Лента Instagram @relictum — единственный источник правды.
   Правится руками; всё остальное производное.
   Ритм 2+1: в каждой тройке слотов ровно один товарный пост (exhibit != null).
   Каждое число в facts обязано сверяться с паспортом: catalog.js по slug,
   promo-data.js по id вида R–0609, eras.js по слагу геологического
   подразделения (для датировок на карточках рубрики era). Не сверено —
   не публикуется.

   Факты для подписей (caption) берутся только из этих файлов дома —
   другого списка нет, следующий фактчекер сверяет по нему:
     shared/catalog.js               — паспорта экспонатов, ключ — slug
     16_product_promos/promo-data.js — промо-тексты, ключ — id вида R–0605
     08_instagram/eras-data.js       — геологические подразделения, ключ — слаг
     06_product_design/index.html    — раздел «Настенные системы»,
                                       карточки Wall № 1–3 (подпись p10)
     02_site_v1_gallery/maison.html  — раздел «Как объект приезжает к вам»,
                                       карточка «01, Футляр» (подпись p14)
   Первые три сверяются машинно (lib/facts.js), последние два — глазами:
   это описания тех самых кадров, снятых для этих постов.

   Пропорция кадров — свойство ПОСТА (поле aspect), а не отдельного кадра:
   Instagram приводит всю карусель к одному соотношению, и кадр другой
   пропорции он обрежет (у карточки-паспорта срезался бы колонтитул).
   Умолчание: одиночный пост — 1:1, карусель — 4:5. Товарные посты со
   спинами идут целиком 1:1 — это заодно снимает вопрос качества спинов
   (исходник 1284×716 в 1:1 тянется ×1,5, а в 4:5 — почти ×1,9).

   Раскладка сетки — четыре диагонали. Сетка профиля идёт по три плитки в
   ряд, поэтому рубрики чередуются циклом с периодом ЧЕТЫРЕ: объект, цифра,
   эпоха, интерьер. Пост рубрики попадает в слоты k, k+4, k+8…, и его колонка
   сдвигается ровно на одну — каждая рубрика марширует по сетке диагональю.
   Правило «2+1» при этом сохраняется: товарные стоят в слотах 1, 5, 9, 13
   (объекты) и 12 (пещерный медведь по рубрике «Интерьер») — ровно один на
   тройку. Порядок держит checkRubricDiagonals в lib/feed-schema.js: сбитый
   цикл сборку не пройдёт.

   Каждый пост открывается фотографией или видео — карточка первым кадром
   не ставится: в сетке профиля плитка должна быть снимком, а не текстом.
   Финальной карточки RELICTUM у постов больше нет: подпись дома стоит
   кометой в углу каждой карточки «поверх кадра», и повторять её отдельным
   слайдом незачем. Шаблон end остался в templates/ на случай, если
   понадобится закрывать особые посты, но лентой не используется.

   Время обложки видео-кадра — поле cover (секунды): обложка это всё, что
   видно в сетке ленты, и на некоторых роликах в момент по умолчанию
   животное оказывается частью вне кадра. */
window.RELICTUM_FEED = [
  {
    id: 'p03',
    date: '2026-08-18',
    rubric: 'object',
    slot: 1,
    exhibit: 'megalodon-tooth',
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'int_ph_megalodon.jpg' },
      { type: 'video', src: 'spin_megalodon.mp4' },
      { type: 'card', tpl: 'spec', data: { bg: 'ph_megalodon.jpg',  name: 'Зуб мегалодона', rows: [['Возраст', '≈ 23 млн лет, миоцен'], ['Оформление', 'Стальной стенд']] } },
    ],
    // Про износ крупных экземпляров дом не утверждает: в источниках сказано
    // скромнее — сочетание, редкое для зуба такой величины (promo-data.js
    // R–0201, profile.paragraphs[3]).
    caption: { lead: 'Зуб мегалодона, Индонезия', body: 'Эмаль сохранилась целиком, зазубренная режущая кромка не сточена и не подправлена. Для зуба такой величины сочетание редкое.', cta: 'Стоимость и наличие — по запросу в галерею.' },
    tags: ['#relictum', '#мегалодон', '#миоцен'],
    facts: [
      { claim: 'возраст', value: '≈ 23 млн лет, миоцен', source: 'catalog.js:megalodon-tooth.age', checked: true },
      { claim: 'оформление', value: 'Стальной стенд', source: 'catalog.js:megalodon-tooth.mount', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p02',
    date: '2026-08-20',
    rubric: 'figure',
    slot: 2,
    exhibit: null,
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'ph_seymchan.jpg' },
      { type: 'card', tpl: 'figure', data: { bg: 'int_ph_seymchan.jpg',  name: 'Сеймчан', big: '≈ 4,56 млрд лет', sub: 'Возраст вещества палласита — старше Земли.' } },
    ],
    caption: { lead: 'Палласит Сеймчан', body: 'Полированный срез железно-каменного метеорита показывает янтарные зёрна оливина в никелистом железе. Рисунок застыл при кристаллизации и не повторяется ни у одного другого среза.', cta: '' },
    tags: ['#relictum', '#метеорит', '#палласит'],
    facts: [
      { claim: 'возраст', value: '≈ 4,56 млрд лет', source: 'catalog.js:seymchan-pallasite.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p01',
    date: '2026-08-22',
    rubric: 'era',
    slot: 3,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'video', src: 'era_mammoth.mp4' },
      { type: 'card', tpl: 'era', data: { bg: 'era_mammoth.jpg',  era: 'Плейстоцен', when: '2,6 млн — 11,7 тыс лет назад', fact: 'Мамонтовая степь тянулась от Испании до Юкона.' } },
    ],
    caption: { lead: 'Ледниковая эпоха', body: 'Она закрывается переходом к голоцену — времени, в котором мы живём. Кость её зверей лучше всего сохранила якутская мерзлота: почти нетронутой, с природным цветом и фактурой поверхности.', cta: '' },
    tags: ['#relictum', '#плейстоцен', '#палеонтология'],
    facts: [
      { claim: 'датировка эпохи', value: '2,6 млн — 11,7 тыс лет назад', source: 'eras.js:pleistocene.when', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p10',
    date: '2026-08-24',
    rubric: 'interior',
    slot: 4,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'photo', src: 'int_curiosity_wall.jpg' },
    ],
    caption: { lead: 'Кабинет редкостей', body: 'Сетка бронзовых кубов с микроподсветкой собирает малые предметы коллекции в одну настенную инсталляцию. Она растёт вместе с коллекцией — куб за кубом.', cta: 'Подробности — по запросу в галерею.' },
    tags: ['#relictum', '#интерьер', '#кабинетредкостей'],
    facts: [],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p06',
    date: '2026-08-26',
    rubric: 'object',
    slot: 5,
    exhibit: 'mammoth-skull-tusks',
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'int_ph_mammoth_skull.jpg' },
      { type: 'video', src: 'spin_mammoth_skull.mp4' },
      { type: 'card', tpl: 'spec', data: { bg: 'ph_mammoth_skull.jpg',  name: 'Череп мамонта с бивнями', rows: [['Возраст', '≈ 30 000 лет'], ['Оформление', 'Гранитный блок, бронзовые опоры']] } },
    ],
    caption: { lead: 'Череп мамонта, Якутия', body: 'Череп сохранил оба бивня карамельной патины, размах 2,4 метра. Такими бивнями мамонт счищал снег с мёрзлой травы и обдирал кору с редких деревьев тундростепи.', cta: 'Стоимость и наличие — по запросу в галерею.' },
    tags: ['#relictum', '#мамонт', '#якутия'],
    facts: [
      { claim: 'возраст', value: '≈ 30 000 лет', source: 'catalog.js:mammoth-skull-tusks.age', checked: true },
      { claim: 'оформление', value: 'Гранитный блок, бронзовые опоры', source: 'catalog.js:mammoth-skull-tusks.mount', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p04',
    date: '2026-08-28',
    rubric: 'figure',
    slot: 6,
    exhibit: null,
    format: 'carousel',
    aspect: '1:1',
    // Возраст здесь — возраст ВИДА, а не предмета: сам объект в галерее
    // сделан по научным данным (catalog.js:0219-dunkleosteus.location —
    // «Реконструкция по научным данным»). Карточка и подпись говорят это
    // прямо, иначе пост продавал бы возраст предмета, которому несколько лет.
    frames: [
      { type: 'photo', src: 'ph_dunkleosteus.jpg' },
      { type: 'card', tpl: 'figure', data: { bg: 'int_ph_dunkleosteus.jpg',  name: 'Dunkleosteus', big: '≈ 360 млн лет', period: 'поздний девон', sub: 'Возраст панцирной рыбы как вида. Сам объект — научная реконструкция черепа и головного щита.' } },
    ],
    caption: { lead: 'Броня вместо зубов', body: 'Dunkleosteus terrelli — панцирная рыба девонских морей: голову закрывали массивные костные пластины, а вместо зубов смыкались острые режущие костные кромки. Она жила почти за сто миллионов лет до первых динозавров. Объект в галерее — реконструкция черепа и головного щита по научным данным; названный возраст относится к самой рыбе.', cta: '' },
    tags: ['#relictum', '#девон', '#панцирныерыбы'],
    facts: [
      { claim: 'возраст', value: '≈ 360 млн лет, поздний девон', source: 'catalog.js:0219-dunkleosteus.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p05',
    date: '2026-08-30',
    rubric: 'era',
    slot: 7,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'video', src: 'era_cretaceous.mp4' },
      { type: 'card', tpl: 'era', data: { bg: 'era_cretaceous.jpg',  era: 'Меловой период', when: '145 — 66 млн лет назад', fact: 'Последний период мезозоя закончился падением астероида на полуострове Юкатан.' } },
    ],
    caption: { lead: 'Лес раннего мела', body: 'На месте нынешнего Ляонина стояли леса из гинкго и хвойных. Вулканический пепел время от времени накрывал всё живое — ему обязана сохранность жехольской фауны, сообщества из формации Исянь.', cta: '' },
    tags: ['#relictum', '#мел', '#мезозой'],
    facts: [
      { claim: 'датировка периода', value: '145 — 66 млн лет назад', source: 'eras.js:cretaceous.when', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p14',
    date: '2026-09-01',
    rubric: 'interior',
    slot: 8,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'photo', src: 'pack_leather_box_open.jpg' },
    ],
    caption: { lead: 'Футляр дома', body: 'Кожа ручной работы с тиснёной кометой дома. Внутри — замшевое ложе, вырезанное по форме конкретного предмета.', cta: '' },
    tags: ['#relictum', '#ритуалдома', '#упаковка'],
    facts: [],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p09',
    date: '2026-09-03',
    rubric: 'object',
    slot: 9,
    exhibit: '0611-coelodonta-skeleton',
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'int_ph_rhino_skeleton.jpg' },
      { type: 'video', src: 'spin_rhino_skeleton.mp4' },
      { type: 'card', tpl: 'spec', data: { bg: 'ph_rhino_skeleton.jpg',  name: 'Скелет шерстистого носорога', rows: [['Возраст', '50–150 тыс лет, плейстоцен'], ['Оформление', 'Профессиональная сборка на скрытом каркасе']] } },
    ],
    caption: { lead: 'Второй по величине в мамонтовой степи', body: 'Полные смонтированные скелеты этого зверя наперечёт даже в музейных собраниях. Здесь костяк собран целиком: низко посаженный череп, крупные рога, короткие столбчатые ноги, поставленные в шаг.', cta: 'Стоимость и условия — по запросу в галерею.' },
    tags: ['#relictum', '#шерстистыйносорог', '#плейстоцен'],
    facts: [
      { claim: 'возраст', value: '50–150 тыс лет, плейстоцен', source: 'catalog.js:0611-coelodonta-skeleton.age', checked: true },
      { claim: 'оформление', value: 'Профессиональная сборка на скрытом каркасе', source: 'catalog.js:0611-coelodonta-skeleton.mount', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p08',
    date: '2026-09-05',
    rubric: 'figure',
    slot: 10,
    exhibit: null,
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'ph_trilobite_giant.jpg' },
      { type: 'card', tpl: 'figure', data: { bg: 'int_ph_trilobite_giant.jpg',  name: 'Трилобит', big: '≈ 480–472 млн лет', period: 'ранний ордовик', sub: 'Возраст гигантского трилобита раннего ордовика.' } },
    ],
    caption: { lead: 'Сланцы Fezouata, Марокко', body: 'Dikelokephalina — род крупных морских трилобитов древней Гондваны. Трилобиты этой формации заметно крупнее привычных находок и доходят до тридцати с лишним сантиметров, что для группы редкость.', cta: '' },
    tags: ['#relictum', '#трилобит', '#марокко'],
    facts: [
      { claim: 'возраст', value: '≈ 480–472 млн лет, ранний ордовик', source: 'catalog.js:0217-dikelokephalina.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p07',
    date: '2026-09-07',
    rubric: 'era',
    slot: 11,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'video', src: 'era_paleozoic_sea.mp4' },
      { type: 'card', tpl: 'era', data: { bg: 'era_paleozoic_sea.jpg',  era: 'Палеозойская эра', when: '539 — 252 млн лет назад', fact: 'Трилобиты и панцирные рыбы населяли тёплые мелководные шельфы.' } },
    ],
    caption: { lead: 'От кембрия до перми', body: 'Эра начинается кембрием и заканчивается на рубеже с триасовым периодом. Между этими границами — ордовикские моря, а следом девон, который называют веком рыб.', cta: '' },
    tags: ['#relictum', '#палеозой', '#ордовик'],
    facts: [
      { claim: 'датировка эры', value: '539 — 252 млн лет назад', source: 'eras.js:paleozoic.when', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p12',
    date: '2026-09-09',
    rubric: 'interior',
    slot: 12,
    exhibit: 'cave-bear-skeleton',
    format: 'carousel',
    aspect: '4:5',
    frames: [
      // cover: камера в этом ролике наезжает, и уже к 0,3 с череп уходит за
      // верхнюю кромку — на 2,0 с (прежнее жёсткое время) головы в кадре нет
      // вовсе. Обложка — единственное, что видно в сетке ленты, поэтому
      // берём самый первый кадр: зверь там целиком, от черепа до основания.
      { type: 'video', src: 'intv_cavebear.mp4', cover: 0 },
      { type: 'photo', src: 'g_cavebear_1.jpg' },
      { type: 'card', tpl: 'spec', data: { bg: 'g_cavebear_2.jpg',  name: 'Скелет пещерного медведя', rows: [['Возраст', 'более 12 000 лет, плейстоцен'], ['Оформление', 'Стальной штырь на чернёном основании']] } },
    ],
    caption: { lead: 'Пещерный медведь в холле', body: 'Скелет почти в три метра держит пространство просторного холла или галереи. Соседства другой крупной мебели он не требует и в большом зале работает доминантой.', cta: 'Стоимость и доставка — по запросу в галерею.' },
    tags: ['#relictum', '#пещерныймедведь', '#интерьер'],
    facts: [
      { claim: 'возраст', value: 'более 12 000 лет, плейстоцен', source: 'catalog.js:cave-bear-skeleton.age', checked: true },
      { claim: 'оформление', value: 'Стальной штырь на чернёном основании', source: 'catalog.js:cave-bear-skeleton.mount', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p15',
    date: '2026-09-11',
    rubric: 'object',
    slot: 13,
    exhibit: '0617-mammoth-skeleton',
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'int_ph_mammoth_skeleton.jpg' },
      { type: 'video', src: 'spin_mammoth_skeleton.mp4' },
      { type: 'card', tpl: 'spec', data: { bg: 'ph_mammoth_skeleton.jpg',  name: 'Скелет мамонта', rows: [['Возраст', '2,6 млн – 11 тыс лет, плейстоцен'], ['Оформление', 'Скрытый стальной каркас, монтаж на месте']] } },
    ],
    caption: { lead: 'Мамонт, собранный целиком', body: 'Полный скелет задаёт масштаб всему помещению: под него подбирают зал, а не место в зале. Несущую способность пола дом проверяет заранее, до выбора точки установки.', cta: 'Условия установки и стоимость — по запросу в галерею.' },
    tags: ['#relictum', '#мамонт', '#монументы'],
    facts: [
      { claim: 'возраст', value: '2,6 млн – 11 тыс лет, плейстоцен', source: 'catalog.js:0617-mammoth-skeleton.age', checked: true },
      { claim: 'оформление', value: 'Скрытый стальной каркас, монтаж на месте', source: 'catalog.js:0617-mammoth-skeleton.mount', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p11',
    date: '2026-09-13',
    rubric: 'figure',
    slot: 14,
    exhibit: null,
    format: 'carousel',
    aspect: '1:1',
    frames: [
      { type: 'photo', src: 'ph_keichousaurus.jpg' },
      { type: 'card', tpl: 'figure', data: { bg: 'int_ph_keichousaurus.jpg',  name: 'Кейхозавр', big: '≈ 245 млн лет', period: 'триасовый период', sub: 'Возраст скелета кейхозавра триасового периода.' } },
    ],
    caption: { lead: 'Лапы, ставшие вёслами', body: 'Keichousaurus hui — небольшая морская рептилия из группы завроптеригий, населявшая тёплые мелководья триасового Китая. Один из первых опытов рептилий вернуться в море.', cta: '' },
    tags: ['#relictum', '#триас', '#морскиерептилии'],
    facts: [
      { claim: 'возраст', value: '≈ 245 млн лет, триасовый период', source: 'catalog.js:0212-keichousaurus-hui.age', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
  {
    id: 'p13',
    date: '2026-09-15',
    rubric: 'era',
    slot: 15,
    exhibit: null,
    format: 'carousel',
    aspect: '4:5',
    frames: [
      { type: 'video', src: 'era_hadean.mp4' },
      { type: 'card', tpl: 'era', data: { bg: 'era_hadean.jpg',  era: 'Катархей', when: '4,6 — 4 млрд лет назад', fact: 'Древнейший эон Земли. Целых пород той эпохи не сохранилось — редкое исключение: цирконы Джек-Хиллз в Австралии, почти до 4,4 млрд лет.' } },
    ],
    caption: { lead: 'Шкала времени дописывается до сих пор', body: 'Верхнюю границу катархея, рубеж с археем, Международный союз геологических наук утвердил только в 2023 году — по гнейсам Акаста (Acasta Gneiss), которые её и обозначают.', cta: '' },
    tags: ['#relictum', '#катархей', '#геология'],
    facts: [
      { claim: 'датировка эона', value: '4,6 — 4 млрд лет назад', source: 'eras.js:hadean.when', checked: true },
    ],
    status: 'ready',
    blockers: [],
  },
];
