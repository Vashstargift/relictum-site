/* RELICTUM i18n — клиентский перевод витрины на EN / 中文 / العربية.
   Словарь: точная русская строка → [en, zh, ar]. Строки без перевода остаются
   русскими. Арабский включает RTL. Выбор языка хранится в localStorage. */
(function(){
'use strict';
var LANGS=['ru','en','zh','ar'];
var LABEL={ru:'RU',en:'EN',zh:'中文',ar:'عربي'};

/* ---------- UI, навигация, секции ---------- */
var D={
"Каталог":["Catalogue","收藏目录","الكتالوج"],
"Интерьеры":["Interiors","空间陈列","الديكور الداخلي"],
"Экспедиции":["Expeditions","科考探险","البعثات"],
"Эры":["Eras","地质纪元","العصور"],
"О нас":["About","关于我们","من نحن"],
"О доме":["The Maison","关于本馆","عن الدار"],
"Дом":["Maison","本馆","الدار"],
"Главная":["Home","首页","الرئيسية"],
"Коллекция":["Collection","收藏","المجموعة"],
"Коллекции":["Collections","收藏系列","المجموعات"],
"Контакты":["Contacts","联系方式","اتصل بنا"],
"Роскошь вне времени":["Luxury beyond time","超越时间的奢华","فخامة تتجاوز الزمن"],
"Смотреть":["View","查看","عرض"],
"Листайте":["Scroll","滑动浏览","مرر"],
"Загрузка…":["Loading…","加载中…","جار التحميل…"],
"Весь каталог":["Full catalogue","全部藏品","الكتالوج الكامل"],
"Открыть каталог":["Open the catalogue","打开目录","افتح الكتالوج"],
"Перейти в каталог":["Go to catalogue","进入目录","إلى الكتالوج"],
"Вернуться в каталог":["Back to catalogue","返回目录","العودة إلى الكتالوج"],
"Экспонат":["Exhibit","展品","القطعة"],
"Экспонат не найден":["Exhibit not found","未找到展品","القطعة غير موجودة"],
"Новинки собрания":["New arrivals","最新入藏","وصل حديثاً"],
"Избранные объекты":["Selected objects","精选藏品","قطع مختارة"],
"Разделы коллекции":["Collection worlds","收藏板块","أقسام المجموعة"],
"Персональный подбор":["Personal selection","私人甄选","اختيار شخصي"],
"Подобрать готовое решение":["Choose a ready piece","甄选现货","اختر قطعة جاهزة"],
"Менеджер галереи":["Gallery manager","画廊经理","مدير الصالة"],
"Исследовать Эры":["Explore the Eras","探索纪元","استكشف العصور"],
"Живые эры":["Living eras","活的纪元","عصور حية"],
"Подробнее об Экспедициях":["More about Expeditions","了解科考探险","المزيد عن البعثات"],
"Приватный клуб первооткрывателей":["A private club of discoverers","私人发现者俱乐部","نادٍ خاص للمكتشفين"],
"Примерить в интерьере":["See it in an interior","置于空间中预览","جربها في الديكور"],
"Политика конфиденциальности":["Privacy policy","隐私政策","سياسة الخصوصية"],
"Согласие на обработку ПД":["Personal data consent","个人信息处理同意书","الموافقة على معالجة البيانات"],
"В наличии":["In stock","现货","متوفر"],
"Под заказ":["By order","定制预订","حسب الطلب"],
"Цена по запросу":["Price on request","价格详询","السعر عند الطلب"],
"Сопровождение":["Concierge care","专属服务","خدمة مرافقة"],
"Подлинность":["Authenticity","真品保证","الأصالة"],
"Редкость":["Rarity","稀有度","الندرة"],
"Роскошь":["Luxury","奢华","الفخامة"],
"Часть Вселенной":["A piece of the Universe","宇宙的一部分","قطعة من الكون"],
/* фильтры каталога */
"Фильтры":["Filters","筛选","تصفية"],
"Сбросить":["Reset","重置","إعادة ضبط"],
"Сбросить фильтры":["Reset filters","重置筛选","إعادة ضبط التصفية"],
"Порядок":["Sort","排序","الترتيب"],
"По умолчанию":["Default","默认","افتراضي"],
"Цена: по возрастанию":["Price: low to high","价格：从低到高","السعر: تصاعدياً"],
"Цена: по убыванию":["Price: high to low","价格：从高到低","السعر: تنازلياً"],
"По вашему запросу объектов не найдено.":["Nothing matches your query.","未找到符合条件的藏品。","لا توجد قطع مطابقة لطلبك."],
/* паспорт экспоната */
"Мир":["World","板块","العالم"],
"Категория":["Category","类别","الفئة"],
"Эпоха":["Epoch","时代","الحقبة"],
"Регион":["Region","产地","المنطقة"],
"Возраст":["Age","年代","العمر"],
"Место находки":["Find locality","发现地","مكان الاكتشاف"],
"Дата находки":["Find date","发现时间","تاريخ الاكتشاف"],
"Размер":["Size","尺寸","الحجم"],
"Оформление":["Mounting","装裱","التجهيز"],
"Происхождение":["Provenance","来源","المنشأ"],
"Сохранность":["Preservation","保存状况","حالة الحفظ"],
"Классификация":["Classification","分类","التصنيف"],
"Среда обитания":["Habitat","栖息环境","الموطن"],
"Особенности":["Features","特征","الخصائص"],
"Ценность":["Significance","价值","الأهمية"],
"История":["History","历史","التاريخ"],
"При жизни":["In life","生前","في الحياة"],
"В вашем доме":["In your home","置于家中","في منزلك"],
"В пространстве владельца":["In the owner's space","于藏家空间","في فضاء المقتني"],
"В интерьере":["In an interior","室内陈列","في الديكور"],
"Галерея":["Gallery","图集","المعرض"],
"Визуализация объекта":["Object visualisation","藏品可视化","تصوير القطعة"],
"Композиция":["Composition","组合","التكوين"],
"Смотрите похожие":["Similar objects","相似藏品","قطع مشابهة"],
"Запросить объект":["Enquire about this object","咨询此藏品","استفسر عن القطعة"],
"Добавить в корзину":["Add to cart","加入购物车","أضف إلى السلة"],
"В избранное":["Add to favourites","加入收藏","أضف إلى المفضلة"],
"Добавлено в избранное":["Added to favourites","已加入收藏","أضيف إلى المفضلة"],
"Убрано из избранного":["Removed from favourites","已取消收藏","أزيل من المفضلة"],
"Объект в 360°":["The object in 360°","360°全景","القطعة بزاوية 360°"],
"Потяните рычажок, чтобы увидеть фото-реконструкцию экспоната":["Pull the lever to see the photo reconstruction","拉动滑杆查看复原图","اسحب الذراع لرؤية إعادة البناء المصوّرة"],
/* миры */
"Космос":["Cosmos","宇宙","الكون"],
"Земля":["Earth","大地","الأرض"],
"Жизнь":["Life","生命","الحياة"],
"Монументы":["Monuments","巨迹","الصروح"],
/* категории */
"Метеориты":["Meteorites","陨石","نيازك"],
"Динозавры":["Dinosaurs","恐龙","ديناصورات"],
"Минералы":["Minerals","矿物","معادن"],
"Морские лилии":["Sea lilies","海百合","زنابق البحر"],
"Мамонтовая фауна":["Mammoth fauna","猛犸动物群","حيوانات الماموث"],
"Аммониты":["Ammonites","菊石","أمونيتات"],
"Морские рептилии":["Marine reptiles","海生爬行动物","زواحف بحرية"],
"Бабочки":["Butterflies","蝴蝶","فراشات"],
"Змеи":["Snakes","蛇","ثعابين"],
"Ископаемые рыбы":["Fossil fish","古鱼类","أسماك متحجرة"],
"Пещерные львы":["Cave lions","洞狮","أسود الكهوف"],
"Мегалодон":["Megalodon","巨齿鲨","ميغالودون"],
"Трилобиты":["Trilobites","三叶虫","ثلاثيات الفصوص"],
"Крокодилиформы":["Crocodyliforms","鳄形类","تمساحيات"],
"Жеоды":["Geodes","晶洞","جيود"],
"Саблезубые кошки":["Sabre-toothed cats","剑齿虎","قطط سيفية الأنياب"],
"Ракоскорпионы":["Sea scorpions","板足鲎","عقارب البحر"],
"Эдиакарская фауна":["Ediacaran fauna","埃迪卡拉动物群","حيوانات الإدياكاري"],
"Гиены":["Hyenas","鬣狗","ضباع"],
"Ископаемая древесина":["Fossil wood","硅化木","خشب متحجر"],
"Древние киты":["Ancient whales","古鲸","حيتان قديمة"],
/* периоды и эры */
"До зарождения жизни":["Before life began","生命诞生之前","قبل نشوء الحياة"],
"Меловой период":["Cretaceous period","白垩纪","العصر الطباشيري"],
"Палеогеновый период":["Palaeogene period","古近纪","عصر الباليوجين"],
"Триасовый период":["Triassic period","三叠纪","العصر الترياسي"],
"Плейстоцен":["Pleistocene","更新世","البليستوسين"],
"Юрский период":["Jurassic period","侏罗纪","العصر الجوراسي"],
"Эдиакарский период":["Ediacaran period","埃迪卡拉纪","العصر الإدياكاري"],
"Мезозой":["Mesozoic","中生代","الميزوزوي"],
"Ранний докембрий":["Early Precambrian","早前寒武纪","ما قبل الكمبري المبكر"],
"Каменноугольный период":["Carboniferous period","石炭纪","العصر الكربوني"],
"Девонский период":["Devonian period","泥盆纪","العصر الديفوني"],
"Неогеновый период":["Neogene period","新近纪","عصر النيوجين"],
"Ордовикский период":["Ordovician period","奥陶纪","العصر الأوردوفيشي"],
"Силурийский период":["Silurian period","志留纪","العصر السيلوري"],
"Кайнозой":["Cenozoic","新生代","السينوزوي"],
"Докембрий":["Precambrian","前寒武纪","ما قبل الكمبري"],
"Палеозой":["Palaeozoic","古生代","الباليوزوي"],
/* регионы */
"Россия":["Russia","俄罗斯","روسيا"],
"США":["USA","美国","الولايات المتحدة"],
"Мадагаскар":["Madagascar","马达加斯加","مدغشقر"],
"Луна":["The Moon","月球","القمر"],
"Китай":["China","中国","الصين"],
"ДР Конго":["DR Congo","刚果（金）","الكونغو الديمقراطية"],
"Перу":["Peru","秘鲁","بيرو"],
"Оман":["Oman","阿曼","عُمان"],
"Монголия":["Mongolia","蒙古","منغوليا"],
"Бразилия":["Brazil","巴西","البرازيل"],
"Европа":["Europe","欧洲","أوروبا"],
"Уругвай":["Uruguay","乌拉圭","أوروغواي"],
"Франция":["France","法国","فرنسا"],
"Марокко":["Morocco","摩洛哥","المغرب"],
"Нигер":["Niger","尼日尔","النيجر"],
"Евразия":["Eurasia","欧亚大陆","أوراسيا"],
"Индонезия":["Indonesia","印度尼西亚","إندونيسيا"],
"Украина":["Ukraine","乌克兰","أوكرانيا"],
"Азия":["Asia","亚洲","آسيا"],
"По запросу":["On request","详询","عند الطلب"],
/* названия лотов */
"Палласит Сеймчан":["Seymchan pallasite","塞伊姆昌橄榄陨铁","بالاسيت سيمشان"],
"Скелет дромеозаврида":["Dromaeosaurid skeleton","驰龙类骨架","هيكل دروميوصوري"],
"Метеорит Дронино":["Dronino meteorite","德罗尼诺陨石","نيزك درونينو"],
"Череп трицератопса":["Triceratops skull","三角龙头骨","جمجمة ترايسيراتوبس"],
"Метеорит Чинге":["Chinge meteorite","钦格陨石","نيزك تشينغه"],
"Целестин":["Celestine","天青石","سلستين"],
"Лунный метеорит в раме":["Framed lunar meteorite","装框月球陨石","نيزك قمري مؤطر"],
"Морская лилия":["Sea lily","海百合","زنبقة بحر"],
"Метеорит Дронино, 128 кг":["Dronino meteorite, 128 kg","德罗尼诺陨石，128公斤","نيزك درونينو، 128 كغ"],
"Скелет жехолозавра":["Jeholosaurus skeleton","热河龙骨架","هيكل جيهولوصور"],
"Срез метеорита Алетай":["Aletai meteorite slice","阿勒泰陨石切片","شريحة نيزك أليتاي"],
"Псевдомалахит":["Pseudomalachite","假孔雀石","سودوملاكيت"],
"Куб из метеорита Алетай":["Aletai meteorite cube","阿勒泰陨石立方体","مكعب نيزك أليتاي"],
"Шар из метеорита Алетай":["Aletai meteorite sphere","阿勒泰陨石球","كرة نيزك أليتاي"],
"Скелет пситтакозавра":["Psittacosaurus skeleton","鹦鹉嘴龙骨架","هيكل بسيتاكوصور"],
"Малый шар из метеорита Алетай":["Small Aletai meteorite sphere","阿勒泰陨石小球","كرة صغيرة من نيزك أليتاي"],
"Пирит":["Pyrite","黄铁矿","بيريت"],
"Метеорит Каинсаз":["Kainsaz meteorite","凯恩萨兹陨石","نيزك كاينساز"],
"Метеорит Dhofar":["Dhofar meteorite","佐法尔陨石","نيزك ظفار"],
"Скелет пинакозавра":["Pinacosaurus skeleton","绘龙骨架","هيكل بيناكوصور"],
"Метеорит Озерки":["Ozerki meteorite","奥焦尔基陨石","نيزك أوزيركي"],
"Аметист":["Amethyst","紫水晶","جمشت"],
"Скелет пещерного медведя":["Cave bear skeleton","洞熊骨架","هيكل دب الكهوف"],
"Скелет овираптора":["Oviraptor skeleton","窃蛋龙骨架","هيكل أوفيرابتور"],
"Флюорит с пиритом":["Fluorite with pyrite","萤石与黄铁矿","فلوريت مع بيريت"],
"Череп мамонта с бивнями":["Mammoth skull with tusks","带象牙的猛犸头骨","جمجمة ماموث بأنيابها"],
"Череп пситтакозавра":["Psittacosaurus skull","鹦鹉嘴龙头骨","جمجمة بسيتاكوصور"],
"Пара бивней мамонта":["Pair of mammoth tusks","一对猛犸象牙","زوج من أنياب الماموث"],
"Аммонит Speetoniceras":["Speetoniceras ammonite","Speetoniceras菊石","أمونيت سبيتونيسيراس"],
"Скелет пернатого динозавра":["Feathered dinosaur skeleton","带羽恐龙骨架","هيكل ديناصور ريشي"],
"Уваровит":["Uvarovite","钙铬榴石","أوفاروفيت"],
"Череп шерстистого носорога":["Woolly rhinoceros skull","披毛犀头骨","جمجمة وحيد القرن الصوفي"],
"Аммонит Craspedodiscus":["Craspedodiscus ammonite","Craspedodiscus菊石","أمونيت كراسبيدوديسكوس"],
"Яйца динозавра":["Dinosaur eggs","恐龙蛋","بيض ديناصور"],
"Антимонит":["Stibnite","辉锑矿","ستيبنيت"],
"Скелет шерстистого носорога":["Woolly rhinoceros skeleton","披毛犀骨架","هيكل وحيد القرن الصوفي"],
"Аммонит Arietites":["Arietites ammonite","Arietites菊石","أمونيت أرييتيتس"],
"Сеймчан без оливина":["Seymchan without olivine","无橄榄石塞伊姆昌陨铁","سيمشان بدون زبرجد"],
"Челюсть спинозавра":["Spinosaurus jaw","棘龙颌骨","فك سبينوصور"],
"Нога мамонта":["Mammoth leg","猛犸腿骨","ساق ماموث"],
"Аммониты полированные":["Polished ammonites","抛光菊石组","أمونيتات مصقولة"],
"Пластина метеорита Омолон":["Omolon meteorite plate","奥莫隆陨石板","لوح نيزك أومولون"],
"Коготь крупного теропода":["Large theropod claw","大型兽脚类爪","مخلب ثيروبود ضخم"],
"Горный хрусталь":["Rock crystal","水晶","كوارتز صخري"],
"Скелет степного зубра":["Steppe bison skeleton","草原野牛骨架","هيكل بيسون السهوب"],
"Аммонит Cleoniceras":["Cleoniceras ammonite","Cleoniceras菊石","أمونيت كليونيسيراس"],
"Скелет кейхозавра":["Keichousaurus skeleton","贵州龙骨架","هيكل كيتشوصور"],
"Композиция из метеоритов Дронино":["Dronino meteorite composition","德罗尼诺陨石组合","تكوين نيازك درونينو"],
"Скелет птерозавра на плите":["Pterosaur skeleton on slab","板上翼龙骨架","هيكل تيروصور على لوح"],
"Сфалерит с кальцитом":["Sphalerite with calcite","闪锌矿与方解石","سفاليريت مع كالسيت"],
"Скелет плейстоценового волка":["Pleistocene wolf skeleton","更新世狼骨架","هيكل ذئب البليستوسين"],
"Аммонит юрский":["Jurassic ammonite","侏罗纪菊石","أمونيت جوراسي"],
"Скелет миксозавра":["Mixosaurus skeleton","混鱼龙骨架","هيكل ميكسوصور"],
"Коллекция бабочек":["Butterfly collection","蝴蝶标本集","مجموعة فراشات"],
"Метеорит Челябинск":["Chelyabinsk meteorite","车里雅宾斯克陨石","نيزك تشيليابينسك"],
"Череп афровенатора":["Afrovenator skull","非洲猎龙头骨","جمجمة أفروفيناتور"],
"Малахит":["Malachite","孔雀石","ملاكيت"],
"Скелет мамонта":["Mammoth skeleton","猛犸骨架","هيكل ماموث"],
"Скелет нотозавра на плите":["Nothosaur skeleton on slab","板上幻龙骨架","هيكل نوثوصور على لوح"],
"Скелет змеи":["Snake skeleton","蛇骨架","هيكل ثعبان"],
"Лапа пситтакозавра":["Psittacosaurus foot","鹦鹉嘴龙足部","قدم بسيتاكوصور"],
"Лапа пещерного медведя":["Cave bear paw","洞熊掌","كف دب الكهوف"],
"Аммонит в породе":["Ammonite in matrix","母岩中的菊石","أمونيت في صخرته"],
"Панцирная рыба Bothriolepis":["Armoured fish Bothriolepis","沟鳞鱼","سمكة مدرعة بوثريوليبيس"],
"Череп пещерного льва":["Cave lion skull","洞狮头骨","جمجمة أسد الكهوف"],
"Зуб мегалодона":["Megalodon tooth","巨齿鲨牙齿","سن ميغالودون"],
"Гигантский трилобит":["Giant trilobite","巨型三叶虫","ثلاثي فصوص عملاق"],
"Зуб спинозавра в раме":["Framed Spinosaurus tooth","装框棘龙牙齿","سن سبينوصور مؤطر"],
"Септария":["Septarian nodule","龟甲石","سبتاريا"],
"Череп пещерного медведя":["Cave bear skull","洞熊头骨","جمجمة دب الكهوف"],
"Зуб мозазавра в раме":["Framed mosasaur tooth","装框沧龙牙齿","سن موزاصور مؤطر"],
"Череп Dunkleosteus":["Dunkleosteus skull","邓氏鱼头甲","جمجمة دنكليوستيوس"],
"Зуб акулы Otodus obliquus в раме":["Framed Otodus obliquus tooth","装框Otodus obliquus鲨齿","سن قرش أوتودوس مؤطر"],
"Плита с трилобитами":["Trilobite slab","三叶虫板","لوح ثلاثيات الفصوص"],
"Скелет дирозавра":["Dyrosaurus skeleton","叉齿鳄骨架","هيكل ديروصور"],
"Череп саблезубой кошки":["Sabre-toothed cat skull","剑齿虎头骨","جمجمة قط سيفي الأنياب"],
"Ракоскорпион":["Sea scorpion","板足鲎","عقرب البحر"],
"Медузоиды Nemiana":["Nemiana medusoids","Nemiana水母状化石","ميدوزويدات نيميانا"],
"Череп динокрокуты":["Dinocrocuta skull","巨鬣狗头骨","جمجمة دينوكروكوتا"],
"Окаменелое дерево":["Petrified wood","硅化木","خشب متحجر"],
"Бивень мамонта":["Mammoth tusk","猛犸象牙","ناب ماموث"],
"Череп базилозавра":["Basilosaurus skull","龙王鲸头骨","جمجمة باسيلوصور"],
"Череп мозазавра":["Mosasaurus skull","沧龙头骨","جمجمة موزاصور"],
"Аммонит полированный крупный":["Large polished ammonite","大型抛光菊石","أمونيت كبير مصقول"],
/* --- фильтры каталога --- */
"Наличие":["Availability","供应状态","التوفر"],
"Тип объекта":["Object type","藏品类型","نوع القطعة"],
"Эра":["Era","代","الحقبة"],
"Период":["Period","纪","الفترة"],
"Регион находки":["Find region","发现地区","منطقة الاكتشاف"],
"Цена":["Price","价格","السعر"],
"Минералы и кристаллы":["Minerals and crystals","矿物与晶体","معادن وبلورات"],
"Звери ледникового периода":["Ice age beasts","冰河时代动物","حيوانات العصر الجليدي"],
"Морские ящеры и рыбы":["Marine reptiles and fish","海生爬行动物与鱼类","زواحف وأسماك بحرية"],
"Бабочки и змеи":["Butterflies and snakes","蝴蝶与蛇","فراشات وثعابين"],
"Древнейшая жизнь":["Earliest life","最古老的生命","أقدم أشكال الحياة"],
"Окаменелое дерево":["Petrified wood","硅化木","خشب متحجر"],
"Пермский период":["Permian period","二叠纪","العصر البرمي"],
"Миоцен":["Miocene","中新世","الميوسين"],
"до 500 000 ₽":["under 500,000 ₽","50万卢布以下","أقل من 500,000 ₽"],
"500 000 – 1 млн ₽":["500,000 – 1M ₽","50万–100万卢布","500,000 – مليون ₽"],
"1 – 3 млн ₽":["1 – 3M ₽","100万–300万卢布","1 – 3 مليون ₽"],
"свыше 3 млн ₽":["over 3M ₽","300万卢布以上","أكثر من 3 مليون ₽"],
"Закрыть":["Close","关闭","إغلاق"],
"Поиск: вид, место, эпоха…":["Search: species, place, epoch…","搜索：物种、产地、时代…","بحث: النوع، المكان، الحقبة…"],
"от, ₽":["from, ₽","起，卢布","من، ₽"],
"до, ₽":["to, ₽","至，卢布","إلى، ₽"],
/* --- главная --- */
"Дом Relictum":["Maison Relictum","Relictum 之家","دار ريليكتوم"],
"Галерея редких объектов из глубины времени. Земля · Жизнь · Космос.":["A gallery of rare objects from the depths of time. Earth · Life · Cosmos.","来自时间深处的珍稀藏品画廊。大地 · 生命 · 宇宙。","صالة عرض لقطع نادرة من أعماق الزمن. الأرض · الحياة · الكون."],
"Земля · Жизнь · Космос":["Earth · Life · Cosmos","大地 · 生命 · 宇宙","الأرض · الحياة · الكون"],
"Три измерения. Одна вечность.":["Three dimensions. One eternity.","三个维度，一个永恒。","ثلاثة أبعاد. أبدية واحدة."],
"До начала":["Before the dawn","在人类历史","قبل بداية"],
"истории":["of human","开始","تاريخ"],
"людей":["history","之前","البشر"],
"Внеземные артефакты, палласиты и метеориты":["Extraterrestrial artefacts, pallasites and meteorites","地外造物、橄榄陨铁与陨石","قطع من خارج الأرض: بالاسيت ونيازك"],
"Редчайшие кристаллы и природные минералы":["The rarest crystals and natural minerals","最稀有的晶体与天然矿物","أندر البلورات والمعادن الطبيعية"],
"Скелеты гигантов, окаменелости, аммониты":["Skeletons of giants, fossils, ammonites","巨兽骨架、化石与菊石","هياكل العمالقة والأحافير والأمونيتات"],
"Комплексные решения для ваших пространств":["Complete solutions for your spaces","为您的空间提供整体方案","حلول متكاملة لمساحاتك"],
"Не нашли то, что искали?":["Did not find what you were looking for?","没有找到您想要的？","لم تجد ما تبحث عنه؟"],
"Эра динозавров":["The age of dinosaurs","恐龙时代","عصر الديناصورات"],
"Частные экспедиции Relictum":["Private Relictum expeditions","Relictum 私人科考","بعثات ريليكتوم الخاصة"],
"Скульптуры,":["Sculptures,","雕塑，","منحوتات،"],
/* --- о доме --- */
"Философия дома":["The maison's philosophy","本馆理念","فلسفة الدار"],
"Основатели Relictum":["Founders of Relictum","Relictum 创始人","مؤسسو ريليكتوم"],
"Авторы проекта":["Project authors","项目主创","فريق المشروع"],
"Галерея дома":["The maison's gallery","本馆展厅","صالة الدار"],
"Дом Relictum вживую":["Maison Relictum in person","实地探访 Relictum","دار ريليكتوم على الطبيعة"],
"Объекты, несущие в себе миллионы лет истории":["Objects that carry millions of years of history","承载数百万年历史的藏品","قطع تحمل ملايين السنين من التاريخ"],
"Произведения искусства, созданные за миллионы лет самой природой":["Works of art created by nature itself over millions of years","由自然历经数百万年创作的艺术品","أعمال فنية صنعتها الطبيعة عبر ملايين السنين"],
"Связаться с нами":["Contact us","联系我们","تواصل معنا"],
"Отправить запрос":["Send enquiry","发送咨询","إرسال الطلب"],
"Запрос в галерею":["Enquiry to the gallery","向画廊咨询","استفسار إلى الصالة"],
"Запрос принят":["Enquiry received","咨询已收到","تم استلام الطلب"],
"Наш менеджер свяжется с вами в течение 15 минут после обращения.":["Our manager will contact you within 15 minutes.","我们的经理将在15分钟内与您联系。","سيتواصل معك مديرنا خلال 15 دقيقة."],
"Продублировать письмом":["Duplicate by e-mail","同时发送邮件","إرسال نسخة بالبريد"],
/* --- интерьеры --- */
"Интерьеры Relictum":["Relictum interiors","Relictum 空间陈列","ديكورات ريليكتوم"],
"Уникальные экспонаты в вашем интерьере":["Unique exhibits in your interior","独一无二的藏品融入您的空间","قطع فريدة في مساحتك"],
"История Земли в каждом пространстве":["The Earth's history in every space","每个空间中的地球史","تاريخ الأرض في كل مساحة"],
"Примерка артефактов в вашем интерьере":["Try artefacts in your interior","在您的空间中预览藏品","تجربة القطع في ديكورك"],
"Решения по комнатам":["Solutions by room","按房间分类的方案","حلول حسب الغرفة"],
"Гостиная":["Living room","客厅","غرفة المعيشة"],
"Кабинет":["Study","书房","المكتب"],
"Спальня":["Bedroom","卧室","غرفة النوم"],
"Прихожая и холл":["Entrance hall","门厅与玄关","المدخل والصالة"],
"Сервис дома":["Maison service","本馆服务","خدمة الدار"],
"Подобрать":["Select","甄选","اختيار"],
"Оставить заявку на визуализацию":["Request a visualisation","申请空间可视化","اطلب تصوراً بصرياً"],
/* --- экспедиции --- */
"Экспедиции дома Relictum":["Maison Relictum expeditions","Relictum 之家科考探险","بعثات دار ريليكتوم"],
"Путешествия к истокам времени":["Journeys to the origins of time","溯源时间之旅","رحلات إلى منابع الزمن"],
"Экспедиционный клуб":["Expedition club","科考俱乐部","نادي البعثات"],
"Направления":["Destinations","目的地","الوجهات"],
"Запросить детали":["Request details","咨询详情","اطلب التفاصيل"],
"Полевые кадры":["Field footage","野外影像","لقطات ميدانية"],
"Из экспедиций дома":["From the maison's expeditions","来自本馆科考","من بعثات الدار"],
"Сахара, Марокко":["Sahara, Morocco","撒哈拉，摩洛哥","الصحراء، المغرب"],
"Якутия, Россия":["Yakutia, Russia","雅库特，俄罗斯","ياقوتيا، روسيا"],
/* --- формы --- */
"Персональный поиск":["Personal search","私人寻找","بحث شخصي"],
"Что вы ищете":["What are you looking for","您在寻找什么","عمّا تبحث"],
"Категория":["Category","类别","الفئة"],
"Бюджет":["Budget","预算","الميزانية"],
"Не важно":["No preference","不限","لا يهم"],
"Не указан":["Not specified","未指定","غير محدد"],
"Опишите запрос":["Describe your request","描述您的需求","صف طلبك"],
"Как с вами связаться":["How to reach you","联系方式","كيف نتواصل معك"],
"Имя":["Name","姓名","الاسم"],
"Телефон":["Phone","电话","الهاتف"],
"Отправить заявку":["Submit request","提交申请","إرسال الطلب"],
"Заявка принята":["Request received","申请已收到","تم استلام الطلب"],
"Мы начали поиск":["We have begun the search","我们已开始寻找","بدأنا البحث"],
"Пока посмотреть каталог":["Browse the catalogue meanwhile","先浏览目录","تصفح الكتالوج ريثما"],
"Не нашли нужный объект?":["Have not found the right object?","没有找到合适的藏品？","لم تجد القطعة المناسبة؟"],
"Древности — палеонтология":["Antiquities — palaeontology","古生物","العصور القديمة — الأحافير"],
"Монумент (скелет, череп, крупная форма)":["Monument (skeleton, skull, large form)","巨型藏品（骨架、头骨、大件）","صرح (هيكل، جمجمة، قطعة كبيرة)"],
"Объект под интерьер / пространство":["An object for an interior or space","适配空间的藏品","قطعة تناسب مساحة محددة"],
"Конкретный вид или объект":["A specific species or object","特定物种或藏品","نوع أو قطعة محددة"],
"Инвестиционный объект":["An investment object","投资型藏品","قطعة استثمارية"],
"Пополнение коллекции":["Adding to a collection","扩充收藏","إضافة إلى مجموعة"],
"Подарок":["A gift","礼品","هدية"],
"Имя и фамилия":["Full name","姓名","الاسم الكامل"],
"Ваш e-mail":["Your e-mail","您的邮箱","بريدك الإلكتروني"],
"E-mail (по желанию)":["E-mail (optional)","邮箱（选填）","البريد الإلكتروني (اختياري)"],
"Что вы ищете? Эпоха, объект, бюджет, интерьер…":["What are you looking for? Epoch, object, budget, interior…","您在寻找什么？时代、藏品、预算、空间…","عمّا تبحث؟ الحقبة، القطعة، الميزانية، المكان…"],
"Сроки, пожелания по доставке и оформлению":["Timing, delivery and presentation preferences","时间、配送与陈列要求","المواعيد وتفضيلات التسليم والعرض"],
/* --- подвал и контакты --- */
"Москва, ул. Большая Якиманка, 22":["22 Bolshaya Yakimanka St., Moscow","莫斯科，大雅基曼卡街22号","موسكو، شارع بولشايا ياكيمانكا 22"],
"Москва, Большая Якиманка, 22":["22 Bolshaya Yakimanka, Moscow","莫斯科，大雅基曼卡22号","موسكو، بولشايا ياكيمانكا 22"],
"Договор-оферта":["Public offer","要约合同","عقد العرض"],
"Галерея Stargift":["Stargift gallery","Stargift 画廊","صالة ستارغيفت"]
};

/* ---------- движок ---------- */
var IDX={en:0,zh:1,ar:2};
function cur(){ try{ return localStorage.getItem('relictum_lang')||'ru'; }catch(e){ return 'ru'; } }
function tr(s,lang){
  var t=s.trim(); if(!t) return null;
  var hit=D[t]; if(!hit) return null;
  var v=hit[IDX[lang]]; if(!v) return null;
  return s.replace(t,v);
}
function walk(root,lang){
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
  var n;
  while((n=w.nextNode())){
    var p=n.parentNode&&n.parentNode.nodeName;
    if(p==='SCRIPT'||p==='STYLE') continue;
    if(n.__ru===undefined) n.__ru=n.nodeValue;
    var src=n.__ru;
    if(lang==='ru'){ if(n.nodeValue!==src) n.nodeValue=src; continue; }
    var out=tr(src,lang);
    if(out&&n.nodeValue!==out) n.nodeValue=out;
  }
  var els=root.querySelectorAll?root.querySelectorAll('[placeholder],[aria-label]'):[];
  for(var i=0;i<els.length;i++){
    ['placeholder','aria-label'].forEach(function(a){
      var el=els[i]; if(!el.hasAttribute(a)) return;
      var key='__ru_'+a;
      if(el[key]===undefined) el[key]=el.getAttribute(a);
      if(lang==='ru'){ el.setAttribute(a,el[key]); return; }
      var out=tr(el[key],lang); if(out) el.setAttribute(a,out);
    });
  }
}
var applying=false;
function apply(lang){
  applying=true;
  document.documentElement.lang=lang==='zh'?'zh-CN':lang;
  document.documentElement.dir=(lang==='ar')?'rtl':'ltr';
  walk(document.body,lang);
  var b=document.getElementById('rlLangBtns');
  if(b){ var bs=b.querySelectorAll('button');
    for(var i=0;i<bs.length;i++) bs[i].style.color=(bs[i].dataset.l===lang)?'var(--gold,#E9C98A)':'';
  }
  applying=false;
}
function set(lang){
  if(LANGS.indexOf(lang)<0) return;
  try{ localStorage.setItem('relictum_lang',lang); }catch(e){}
  apply(lang);
}

/* ---------- переключатель ---------- */
function mountSwitch(){
  if(document.getElementById('rlLangBtns')) return;
  var d=document.createElement('div');
  d.id='rlLangBtns';
  d.style.cssText='position:fixed;bottom:18px;left:18px;z-index:400;display:flex;gap:2px;background:rgba(10,9,8,.82);backdrop-filter:blur(8px);border:1px solid rgba(233,201,138,.35);padding:4px 6px;border-radius:2px;direction:ltr';
  LANGS.forEach(function(l){
    var b=document.createElement('button');
    b.textContent=LABEL[l]; b.dataset.l=l;
    b.style.cssText='background:none;border:none;cursor:pointer;font:500 10.5px/1.6 Inter,sans-serif;letter-spacing:.08em;color:rgba(244,240,232,.75);padding:3px 7px';
    b.onclick=function(){ set(l); };
    d.appendChild(b);
  });
  document.body.appendChild(d);
}

/* ---------- запуск ---------- */
function boot(){
  mountSwitch();
  if(cur()!=='ru') apply(cur()); else apply('ru');
  /* клиентские рендеры (каталог, exhibit) дорисовывают DOM после загрузки */
  var t=null;
  new MutationObserver(function(){
    if(applying) return;
    if(cur()==='ru') return;
    clearTimeout(t); t=setTimeout(function(){ apply(cur()); },200);
  }).observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();
window.RELICTUM_I18N={set:set,current:cur,dict:D};
})();
