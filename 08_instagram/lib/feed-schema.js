// Схема Instagram-поста галереи Relictum и проверка ритма ленты «2+1».
//
// Правило дома: лента читается сеткой по три плитки в ряд. Тройки задаются
// НОМЕРОМ слота, а не позицией поста в массиве: пост со slot=n принадлежит
// тройке Math.floor((n-1)/3), то есть {1,2,3}, {4,5,6}, {7,8,9}... Если
// тройка собрана целиком (все три слота есть в ленте), в ней должен быть
// ровно один товарный пост (задан post.exhibit), остальные два —
// «воздушные» (exhibit: null). Если тройка неполная (в ленте есть не все
// три слота), отсутствие постов само по себе нарушением не считается, но
// два и более товарных поста в такой тройке — всё равно брак.

const fs = require('fs');
const path = require('path');
const { IMG_DIR } = require('./paths.js');
const { findExhibit } = require('./sources.js');
const { checkPostFacts, resolveSource } = require('./facts.js');

// Рубрики ленты. «Ритуал», «Экспедиции» и «Editions» сняты 25.08.2026:
// первые две не обеспечены съёмкой, третья ждёт самого тиража, а держать
// в системе рубрику без материала — значит обещать ленте то, чего нет.
const RUBRICS = ['object', 'figure', 'era', 'interior'];
const TEMPLATES = ['cover', 'figure', 'era', 'spec', 'end'];
const FORMATS = ['carousel', 'reel', 'single'];
const CROPS = ['4:5', '1:1'];
const STATUSES = ['draft', 'ready', 'blocked'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Пропорция — свойство ПОСТА, а не отдельного кадра. Instagram приводит всю
// карусель к одному соотношению сторон: если первый кадр собран 1:1, а
// остальные 4:5, зритель увидит кадры 4:5 обрезанными до квадрата — у
// карточки-паспорта срежется колонтитул, композиция сломается. Поэтому
// соотношение задаётся один раз в post.aspect и применяется ко всем кадрам
// поста; кадру остаётся только не противоречить посту (см. проверку ниже).
const ASPECTS = CROPS;
const DEFAULT_ASPECT = '4:5';
const DEFAULT_ASPECT_BY_FORMAT = { single: '1:1' };

// Пределы данных карточки — правильное место остановить перегруз контента
// это валидатор ленты («сократи»), а не рендерер, который молча ужимает
// шрифт до нечитаемого. Карточки должны быть свёрстаны, а не подогнаны.
// Карточки направления «поверх кадра» стоят на фотографии из shared/img.
// Без подложки они отрендерятся чёрным прямоугольником — молча и незаметно,
// поэтому подложка обязательна на уровне валидатора.
const TEMPLATES_NEEDING_BG = ['cover', 'figure', 'spec', 'era'];

const SPEC_MAX_ROWS = 5; // паспорт (tpl=spec): не больше строк в data.rows
const MAX_TEXT_LENGTH = 220; // любое текстовое значение в data карточки
const MAX_TITLE_LENGTH = 60; // заголовок карточки: data.title/data.name
// Крупное поле карточки «Цифра» (tpl=figure, data.big) набирается кеглем
// 168 пикселей — общий предел в 220 знаков для него не связывает вовсе:
// целая фраза с периодом переносится на три-четыре строки, выдавливает
// волосяную линейку и сажает подзаголовок на колонтитул. Предел подобран
// по факту: настоящие значения ленты («≈ 480–472 млн лет» — самое длинное,
// 17 знаков) укладываются в одну-две строки, а фраза с периодом — нет.
// Период карточки живёт в отдельном поле data.period под линейкой.
const MAX_BIG_LENGTH = 20;

// Признак того, что предмет — не сама ископаемая находка, а её воспроизведение.
// Одним и тем же выражением ищем и в паспорте экспоната (там это повод
// требовать раскрытия), и в тексте поста (там это само раскрытие).
const RECONSTRUCTION_RE = /реконструкц|реплик|копи[яию]|новодел|слепок|модел/i;

// Поле заголовка карточки для каждого шаблона, где заголовок есть.
const TITLE_FIELD_BY_TEMPLATE = { cover: 'title', spec: 'name', figure: 'name' };

// Соответствие «шаблон карточки → какие поля данных несут проверяемое
// зрителем утверждение». Раньше это было зашито только для era (датировка
// в data.when) — из-за этого у figure и spec число, показанное на
// карточке, могло разойтись с числом, зарегистрированным фактом поста:
// зритель видит одно, а сверено другое. Каждое поле отсюда обязано найти
// в facts[] поста запись, чьё value дословно (после нормализации пробелов)
// совпадает со значением поля, и чей source резолвится.
//
// Шаблоны cover и end проверяемых утверждений не несут (cover — обложка,
// end — служебная закрывающая карточка) и в это соответствие не входят —
// checkCardConfirmed для них просто ничего не требует.
//
// Функция для каждого шаблона возвращает список { path, value } — path
// нужен только для текста ошибки, value — то, что должно быть подтверждено.
const CONFIRMABLE_FIELDS_BY_TEMPLATE = {
  era: (data) => [{ path: 'data.when', value: data ? data.when : undefined }],
  // Карточка «Цифра»: период вынесен из крупного поля в data.period (иначе
  // фраза целиком не влезает в кегль 168), но зритель по-прежнему видит
  // утверждение целиком — «≈ 480–472 млн лет» и под ним «ранний ордовик».
  // Поэтому подтверждать фактом обязано именно показанное целиком, а не
  // одно крупное поле: иначе период можно было бы дописать на карточку в
  // обход всякой сверки.
  figure: (data) => {
    const big = data ? data.big : undefined;
    const period = data ? data.period : undefined;
    if (typeof big === 'string' && typeof period === 'string' && period.trim() !== '') {
      return [{ path: 'data.big + data.period', value: `${big}, ${period}` }];
    }
    return [{ path: 'data.big', value: big }];
  },
  spec: (data) => {
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    return rows.map((row, i) => ({
      path: `data.rows[${i}][1]`,
      value: Array.isArray(row) ? row[1] : undefined,
    }));
  },
};

// Обходит data кадра карточки рекурсивно (объекты и массивы, напр. рядки
// паспорта data.rows) и собирает все строковые значения вместе с их путём
// (для сообщения об ошибке) — так предел длины проверяется одинаково для
// любого текстового поля, а не только для перечисленных по имени.
function collectTexts(value, fieldPath, out) {
  if (typeof value === 'string') {
    out.push({ path: fieldPath, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectTexts(v, `${fieldPath}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([k, v]) => collectTexts(v, fieldPath ? `${fieldPath}.${k}` : k, out));
  }
}

// Проверка данных кадра типа card: пределы на паспорт (spec), длину любого
// текстового значения и длину заголовка карточки. bad(msg) уже знает id
// поста, сюда передаём только текст «что именно превышено».
function validateCardData(frame, frameLabel, bad) {
  const data = frame.data || {};

  if (TEMPLATES_NEEDING_BG.includes(frame.tpl)) {
    if (!data.bg) {
      bad(`${frameLabel}: у карточки «${frame.tpl}» нет подложки (data.bg) — она стоит на фотографии`);
    } else if (/[:/\\]/.test(data.bg)) {
      bad(`${frameLabel}: data.bg должен быть именем файла в shared/img, а не путём`);
    } else if (!fs.existsSync(path.join(IMG_DIR, data.bg))) {
      bad(`${frameLabel}: подложка «${data.bg}» не найдена в shared/img`);
    }
  }

  const titleField = TITLE_FIELD_BY_TEMPLATE[frame.tpl];
  if (titleField && typeof data[titleField] === 'string' && data[titleField].length > MAX_TITLE_LENGTH) {
    bad(`${frameLabel}: заголовок карточки («${titleField}») длиннее ${MAX_TITLE_LENGTH} знаков (сейчас ${data[titleField].length})`);
  }

  if (frame.tpl === 'figure' && typeof data.big === 'string' && data.big.length > MAX_BIG_LENGTH) {
    bad(
      `${frameLabel}: крупное поле карточки «Цифра» (data.big) длиннее ${MAX_BIG_LENGTH} знаков `
      + `(сейчас ${data.big.length}) — кеглем 168 это уедет на три-четыре строки и выдавит линейку; `
      + 'оставь в крупном поле только число, а период перенеси в data.period'
    );
  }

  if (frame.tpl === 'spec') {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length > SPEC_MAX_ROWS) {
      bad(`${frameLabel}: в паспорте больше ${SPEC_MAX_ROWS} строк в data.rows (сейчас ${rows.length}) — сократи паспорт`);
    }
    rows.forEach((row, i) => {
      const isPair = Array.isArray(row) && row.length === 2
        && typeof row[0] === 'string' && row[0].trim() !== ''
        && typeof row[1] === 'string' && row[1].trim() !== '';
      if (!isPair) {
        bad(`${frameLabel}: строка паспорта ${i + 1} (data.rows[${i}]) должна быть парой из двух непустых строк`);
      }
    });
  }

  const texts = [];
  collectTexts(data, '', texts);
  texts.forEach(({ path, text }) => {
    if (text.length > MAX_TEXT_LENGTH) {
      bad(`${frameLabel}: текст в data.${path} длиннее ${MAX_TEXT_LENGTH} знаков (сейчас ${text.length}) — сократи`);
    }
  });
}

function norm(v) {
  return String(v).replace(/\s+/g, ' ').trim();
}

// Карточки шаблонов era/figure/spec несут утверждение, которое зритель
// видит прямо на плитке (датировка, крупное число, строка паспорта) —
// минуя обычный путь через факты, если бы не эта проверка: такое значение
// вообще не сверялось бы. Требуем для каждого поля из
// CONFIRMABLE_FIELDS_BY_TEMPLATE, чтобы среди фактов поста нашёлся хотя бы
// один, чьё value дословно совпадает со значением на карточке и чей source
// резолвится (т.е. действительно на что-то ссылается, а не просто похож
// на ссылку).
function checkCardConfirmed(sources, post, frame, frameLabel, bad) {
  const getFields = CONFIRMABLE_FIELDS_BY_TEMPLATE[frame.tpl];
  if (!getFields) return; // шаблон без проверяемых утверждений (cover, end)

  const facts = Array.isArray(post.facts) ? post.facts : [];
  const fields = getFields(frame.data);
  fields.forEach(({ path, value }) => {
    if (typeof value !== 'string' || value.trim() === '') {
      bad(`${frameLabel}: у карточки нет значения в ${path}`);
      return;
    }
    const confirmed = facts.some((f) => {
      if (!f || typeof f.value !== 'string') return false;
      if (norm(f.value) !== norm(value)) return false;
      return resolveSource(sources, f.source).ok;
    });
    if (!confirmed) {
      bad(`${frameLabel}: запись «${value}» (${path}) не подтверждена фактом поста — добавь в facts запись, чьё value дословно совпадает с ${path} и чей source резолвится`);
    }
  });
}

// Пропорция поста: явное поле post.aspect, иначе умолчание по формату
// (одиночный пост — квадрат, всё остальное — 4:5). Один и тот же ответ
// используют и валидатор, и сборка — чтобы «пропорция поста» означала
// ровно одно и то же в обоих местах.
function postAspect(post) {
  if (post && typeof post.aspect === 'string') return post.aspect;
  const byFormat = post ? DEFAULT_ASPECT_BY_FORMAT[post.format] : undefined;
  return byFormat || DEFAULT_ASPECT;
}

// Собирает весь текст, который зритель прочитает в посте: данные карточек
// плюс подпись. Нужен проверке раскрытия реконструкции — ей всё равно, где
// именно это сказано, лишь бы было сказано.
function postShownText(post) {
  const parts = [];
  const frames = Array.isArray(post.frames) ? post.frames : [];
  for (const f of frames) {
    if (f && f.type === 'card') {
      const texts = [];
      collectTexts(f.data || {}, '', texts);
      texts.forEach(({ text }) => parts.push(text));
    }
  }
  const c = post.caption || {};
  for (const k of ['lead', 'body', 'cta']) {
    if (typeof c[k] === 'string') parts.push(c[k]);
  }
  return parts.join(' ');
}

// Экспонаты, о которых пост говорит: явная привязка post.exhibit и все
// slug'и catalog.js, на которые ссылаются факты поста. Второе обязательно:
// у карточек рубрики figure post.exhibit пустой (пост «воздушный»), но
// число на карточке взято из паспорта конкретного предмета — именно этот
// предмет зритель и видит.
function postCatalogSlugs(post) {
  const slugs = new Set();
  if (post.exhibit !== null && post.exhibit !== undefined) slugs.add(post.exhibit);
  const facts = Array.isArray(post.facts) ? post.facts : [];
  for (const f of facts) {
    const m = /^catalog\.js:([^.]+)\./.exec(String(f && f.source || ''));
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}

// «Возраст вида» ≠ «возраст предмета». Машинная сверка фактов проверяет
// дословное совпадение с полем паспорта, но не то, к чему число относится:
// у реконструкции возраст принадлежит виду, а сам предмет сделан недавно.
// Поэтому: если паспорт экспоната (location или description) говорит, что
// это воспроизведение, пост обязан назвать это прямо — в тексте карточки
// или в подписи. Не называет — не проходит.
function checkReconstructionDisclosed(sources, post, bad) {
  const shown = postShownText(post);
  const disclosed = RECONSTRUCTION_RE.test(shown);
  for (const slug of postCatalogSlugs(post)) {
    const exhibit = findExhibit(sources, slug);
    if (!exhibit) continue; // отсутствие экспоната ловит отдельная проверка
    const passport = [exhibit.location, exhibit.description]
      .filter((v) => typeof v === 'string')
      .join(' ');
    if (!RECONSTRUCTION_RE.test(passport)) continue;
    if (disclosed) continue;
    bad(
      `экспонат «${slug}» в каталоге назван воспроизведением («${String(exhibit.location || '').trim()}»), `
      + 'а пост нигде этого не называет: возраст относится к виду, а не к самому предмету — '
      + 'скажи в тексте карточки или в подписи, что это реконструкция, иначе пост продаёт возраст предмета, которому несколько лет'
    );
  }
}

// Проверка одного поста: обязательные поля, рубрика, формат, статус,
// привязка к экспонату каталога, кадры (файлы в shared/img существуют,
// src — имя файла, а не путь/URL), подпись и сверка фактов с паспортами.
function validatePost(sources, post) {
  const problems = [];

  // Пост целиком отсутствует (null/undefined) — дальше нечего проверять,
  // без ранней остановки следующая же строка уронит всё исключением.
  // Формулировка отдельная от «нет поля id»: там пост есть, просто без
  // одного поля, а здесь нет самого поста — это разные вещи.
  if (!post) {
    problems.push('(без id): поста нет вовсе — элемент ленты пуст (null/undefined)');
    return { ok: false, problems };
  }

  const id = post.id ? post.id : '(без id)';
  const bad = (msg) => problems.push(`${id}: ${msg}`);

  if (!post.id) bad('нет поля id');
  if (!DATE_RE.test(post.date || '')) bad(`дата должна быть в формате ГГГГ-ММ-ДД, а не «${post.date}»`);
  if (!RUBRICS.includes(post.rubric)) bad(`неизвестная рубрика «${post.rubric}»`);
  if (!Number.isInteger(post.slot) || post.slot < 1) bad(`slot должен быть целым ≥1, а не «${post.slot}»`);
  if (!FORMATS.includes(post.format)) bad(`неизвестный формат «${post.format}»`);
  if (!STATUSES.includes(post.status)) bad(`неизвестный статус «${post.status}»`);

  if (post.exhibit !== null && post.exhibit !== undefined) {
    if (!findExhibit(sources, post.exhibit)) bad(`экспонат «${post.exhibit}» не найден в каталоге`);
  }

  if (post.aspect !== undefined && !ASPECTS.includes(post.aspect)) {
    bad(`неизвестная пропорция поста «${post.aspect}», доступны ${ASPECTS.join(', ')}`);
  }
  const aspect = postAspect(post);

  if (!Array.isArray(post.frames) || post.frames.length === 0) {
    bad('нет ни одного кадра');
  } else {
    post.frames.forEach((f, i) => {
      const n = `кадр ${i + 1}`;
      if (f.type === 'video' || f.type === 'photo') {
        if (!f.src) return bad(`${n}: нет src`);
        if (/[:/\\]/.test(f.src)) return bad(`${n}: src должен быть именем файла в shared/img, а не путём`);
        if (!fs.existsSync(path.join(IMG_DIR, f.src))) bad(`${n}: файл «${f.src}» не найден в shared/img`);
        if (f.cover !== undefined && (typeof f.cover !== 'number' || !Number.isFinite(f.cover) || f.cover < 0)) {
          bad(`${n}: время обложки (cover) должно быть неотрицательным числом секунд, а не «${f.cover}»`);
        }
        // Пропорция кадра либо не задана вовсе (берётся из поста), либо
        // обязана совпадать с пропорцией поста: разнобой внутри карусели
        // Instagram приведёт к одному соотношению и обрежет остальные кадры.
        if (f.crop && !CROPS.includes(f.crop)) bad(`${n}: неизвестный кроп «${f.crop}»`);
        else if (f.crop && f.crop !== aspect) {
          bad(
            `${n}: пропорция кадра «${f.crop}» расходится с пропорцией поста «${aspect}» — `
            + 'внутри одного поста пропорция общая (Instagram приведёт карусель к одному соотношению '
            + 'и обрежет остальные кадры, у паспорта срежется колонтитул); задай пропорцию один раз в post.aspect'
          );
        }
      } else if (f.type === 'card') {
        if (!TEMPLATES.includes(f.tpl)) bad(`${n}: неизвестный шаблон «${f.tpl}»`);
        else {
          validateCardData(f, n, bad);
          checkCardConfirmed(sources, post, f, n, bad);
        }
      } else {
        bad(`${n}: неизвестный тип «${f.type}»`);
      }
    });
  }

  if (!post.caption || !post.caption.lead) bad('нет подписи (caption.lead)');

  checkReconstructionDisclosed(sources, post, bad);

  // Сверка фактов делегирована facts.js — там же учтена привязка факта
  // к экспонату поста (post.exhibit), дублировать эту логику не нужно.
  problems.push(...checkPostFacts(sources, post).problems);

  return { ok: problems.length === 0, problems };
}

// Ритм «2+1»: группируем посты по номеру тройки, вычисленному из slot
// (пост со slot=n принадлежит тройке Math.floor((n-1)/3)), а не по позиции
// в массиве — иначе дыра в нумерации слотов сдвигает группы и прячет
// настоящее нарушение. Посты с негодным slot (не целое число ≥1) в
// группировке не участвуют — это уже отдельно ловит validatePost.
//
// Для тройки, где в ленте есть все три слота (полная), требуется ровно
// один товарный пост. Для неполной тройки (не все три слота представлены)
// отсутствие постов само по себе не нарушение, но два и более товарных —
// нарушение независимо от полноты.
function checkRhythm(feed) {
  const problems = [];
  const valid = feed.filter((p) => p && Number.isInteger(p.slot) && p.slot >= 1);

  const groups = new Map(); // индекс тройки -> посты этой тройки
  for (const p of valid) {
    const idx = Math.floor((p.slot - 1) / 3);
    if (!groups.has(idx)) groups.set(idx, []);
    groups.get(idx).push(p);
  }

  const sortedIdx = [...groups.keys()].sort((a, b) => a - b);
  for (const idx of sortedIdx) {
    const group = groups.get(idx).slice().sort((a, b) => a.slot - b.slot);
    const tripleSlots = [idx * 3 + 1, idx * 3 + 2, idx * 3 + 3];
    // Полнота тройки — по числу РАЗНЫХ слотов, а не по числу постов: дубль
    // слота (два поста с одним и тем же slot) не должен превращать полную
    // тройку в неполную и подменять строгое «ровно 1» на мягкое «не
    // больше 1» — иначе тройка с нулём товарных при дубле слота молчаливо
    // проходит проверку.
    const distinctSlots = new Set(group.map((p) => p.slot)).size;
    const isComplete = tripleSlots.every((slot) => group.some((p) => p.slot === slot)) && distinctSlots === 3;
    const goodPosts = group.filter((p) => p.exhibit !== null && p.exhibit !== undefined);
    const goods = goodPosts.length;

    const violated = isComplete ? goods !== 1 : goods > 1;
    if (violated) {
      const need = isComplete ? 'ровно 1' : 'не больше 1';
      const postsDesc = group.map((p) => `${p.id} (slot ${p.slot})`).join(', ');
      problems.push(
        `ритм 2+1 нарушен в тройке слотов {${tripleSlots.join(', ')}}: товарных ${goods}, а должно быть ${need}; посты в тройке: ${postsDesc}`
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

// Раскладка сетки: Instagram показывает ленту плитками по три в ряд, номер
// колонки поста со slot=n — ((n-1) % 3) + 1 (1, 2 или 3). Ритм 2+1 сам по
// себе не гарантирует, что товарные посты не выстроятся в одну колонку —
// формально «один товарный на тройку» может держаться, даже если этот
// единственный товарный каждый раз стоит третьим в тройке (slot 3, 6, 9,
// 12, 15…): тогда все товарные попадают в колонку 3 и при скролле в сетке
// видна сплошная вертикальная полоса вместо чередования «крестиком».
// Проверяем отдельно от ритма: среди товарных постов (exhibit задан)
// с валидным slot должно быть больше одной РАЗНОЙ колонки — если товарных
// меньше двух, «полоса» физически невозможна, и проверка не срабатывает.
function checkGridLayout(feed) {
  const problems = [];
  const goods = feed.filter(
    (p) => p && Number.isInteger(p.slot) && p.slot >= 1 && p.exhibit !== null && p.exhibit !== undefined
  );
  if (goods.length < 2) return { ok: true, problems };

  const colOf = (p) => ((p.slot - 1) % 3) + 1;
  const columns = new Set(goods.map(colOf));
  if (columns.size === 1) {
    const col = [...columns][0];
    const postsDesc = goods
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((p) => `${p.id} (slot ${p.slot})`)
      .join(', ');
    problems.push(
      `раскладка сетки: все товарные посты попадают в колонку ${col} из трёх (сетка 3×N, колонка = ((slot-1)%3)+1) — в ленте это читается как сплошная вертикальная полоса, а не чередование «крестиком»; разведи товарные по разным колонкам, сохранив ровно один на тройку слотов: ${postsDesc}`
    );
  }

  return { ok: problems.length === 0, problems };
}

// Проверка всей ленты: каждый пост по отдельности + отсутствие дублей
// slot/id + ритм 2+1.
function validateFeed(sources, feed) {
  const problems = [];
  const posts = feed.map((p) => {
    const r = validatePost(sources, p);
    const id = p && p.id ? p.id : '(без id)';
    return { id, ok: r.ok, problems: r.problems };
  });

  // Битые элементы (null/undefined) уже отражены в problems через
  // validatePost выше — здесь их просто пропускаем, чтобы не упасть.
  const seenSlot = new Map();
  for (const p of feed) {
    if (!p) continue;
    if (seenSlot.has(p.slot)) problems.push(`slot ${p.slot} занят дважды: ${seenSlot.get(p.slot)} и ${p.id}`);
    else seenSlot.set(p.slot, p.id);
  }

  const seenId = new Set();
  for (const p of feed) {
    if (!p) continue;
    if (seenId.has(p.id)) problems.push(`id «${p.id}» встречается дважды`);
    seenId.add(p.id);
  }

  problems.push(...checkRhythm(feed).problems);
  problems.push(...checkGridLayout(feed).problems);

  const ok = problems.length === 0 && posts.every((p) => p.ok);
  return { ok, posts, problems };
}

module.exports = {
  RUBRICS,
  TEMPLATES,
  ASPECTS,
  SPEC_MAX_ROWS,
  TEMPLATES_NEEDING_BG,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_BIG_LENGTH,
  RECONSTRUCTION_RE,
  CONFIRMABLE_FIELDS_BY_TEMPLATE,
  postAspect,
  validatePost,
  checkRhythm,
  checkGridLayout,
  validateFeed,
};
