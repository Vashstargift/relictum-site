#!/usr/bin/env python3
"""RELICTUM — сборка публичного среза сайта для relictum.gallery.

Из рабочего репозитория (в нём лежат ещё и админка, стратегия, презентации,
черновые версии сайта) собирает папку `public/` только с тем, что показываем
покупателю, и поднимает витрину в корень домена:

    02_site_v1_gallery/*.html  →  /                (главная, каталог, журнал)
    16_product_promos/         →  /objects/        (промо-страницы экспонатов)
    15_concepts/               →  /eras/           (эпохи и концепты)
    14_provenance/             →  /provenance/     (паспорт объекта)
    shared/                    →  /shared/         (медиа, стили, данные)

Не попадает в срез: 09_admin, 13_strategy, 04/07 презентации, брендбук,
дизайн-система, черновые версии сайта v2/v3/v4, корневой хаб index.html.

Запуск:  python3 09_admin/build_public_site.py
Выход:   public/  (в .gitignore, деплоится rsync-ом)
"""
import html, json, sys
import os, re, shutil, subprocess, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public')
DOMAIN = 'https://relictum.gallery'

# Принудительный редирект на https. Включать ТОЛЬКО когда сертификат уже выпущен:
# пока его нет, редирект уводит посетителя на неработающий https и сайт недоступен.
# Let's Encrypt на relictum.gallery выпущен 05.08.2026 (действует до 03.11.2026) — включено.
FORCE_HTTPS = True
OLD_URL = re.compile(r'https://[a-z0-9.-]*github\.io/relictum(?:-site)?/?')

# что копируем: (источник, назначение внутри public, фильтр файлов)
# Список исключений больше не нужен: черновики (lab.html, strata-v2.html,
# mammoth-tusk.html, index-v2.html) удалены из репозитория 07.08.2026 —
# всё, что здесь лежит, идёт наружу.
def html_only(f): return f.endswith('.html')
# deep-time скрыт с сайта (решение владельца 24.08.2026) — в срез не попадает
def concepts(f): return f.endswith('.html') and f != 'deep-time.html'
def html_and_js(f): return f.endswith('.html') or f.endswith('.js')
def showcase(f): return f.endswith('.html') or f.endswith('.css')

COPY = [
    ('02_site_v1_gallery', '', showcase),
    ('16_product_promos', 'objects', html_and_js),
    ('15_concepts', 'eras', concepts),
    ('14_provenance', 'provenance', html_only),
]

# правила переписывания ссылок по «этажам» публичного сайта
REWRITE = {
    '': [                                   # страницы в корне домена
        ('../shared/', 'shared/'),
        ('../15_concepts/', 'eras/'),
        ('../16_product_promos/', 'objects/'),
        ('../14_provenance/', 'provenance/'),
    ],
    'objects': [                            # /objects/*.html
        ('../02_site_v1_gallery/', '../'),
        ('../15_concepts/', '../eras/'),
        ('../14_provenance/', '../provenance/'),
    ],
    'eras': [
        ('../02_site_v1_gallery/', '../'),
        ('../16_product_promos/', '../objects/'),
        ('../14_provenance/', '../provenance/'),
    ],
    'provenance': [
        ('../02_site_v1_gallery/', '../'),
        ('../15_concepts/', '../eras/'),
        ('../16_product_promos/', '../objects/'),
    ],
}


def rewrite_links(text, scope):
    for src, dst in REWRITE.get(scope, []):
        text = text.replace(src, dst)
    return text


# Данные каталога меняются часто, а браузер кэширует .js надолго. Поэтому к скриптам
# дописывается ?v=<хэш содержимого>: пока данные не менялись — адрес прежний и кэш работает,
# как только каталог правят — адрес меняется, и посетитель сразу видит новое.
# Всё, что кэшируется браузером надолго и потому должно версионироваться (?v=…).
# Стили сюда входят обязательно: без них правка шапки или подвала доходит
# до постоянного посетителя только когда истечёт кэш (сейчас 7 дней).
DATA_FILES = ['shared/catalog.js', 'shared/order.js', '16_product_promos/promo-data.js',
              'shared/shop.js', 'shared/nav.js', 'shared/biography.js',
              'shared/chrome.css', 'shared/shop.css', 'shared/fonts.css', 'shared/buttons.css',
              '02_site_v1_gallery/style.css',
              # 06.10.2026: словари и вспомогательные скрипты — иначе их правки неделю живут в кэше браузера
              'shared/i18n.js', 'shared/i18n-lots.js', 'shared/focus.js', '09_admin/i18n_pages.json']


def data_stamp():
    import hashlib
    h = hashlib.sha1()
    for rel in DATA_FILES:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            h.update(open(p, 'rb').read())
    return h.hexdigest()[:8]


def stamp_scripts(text, stamp):
    text = re.sub(r'(<script[^>]+src="[^"]+?\.js)(")', r'\1?v=' + stamp + r'\2', text)
    # шрифты подключены внутри fonts.css и версионируются вместе с ним
    return re.sub(r'(<link[^>]+href="[^"]+?\.css)(")', r'\1?v=' + stamp + r'\2', text)


def public_url(rel_path):
    """Адрес файла на домене. index.html схлопывается в путь папки."""
    p = rel_path.replace(os.sep, '/')
    if p == 'index.html':
        return DOMAIN + '/'
    if p.endswith('/index.html'):
        return DOMAIN + '/' + p[:-len('index.html')]
    return DOMAIN + '/' + p


def fix_meta(text, rel_path):
    """Канонические адреса и OG — на новый домен, каждой странице свой."""
    url = public_url(rel_path)
    text = OLD_URL.sub(DOMAIN + '/', text)                       # прежний github.io
    text = re.sub(r'(<link rel="canonical" href=")[^"]*(")', r'\1' + url + r'\2', text)
    text = re.sub(r'(<meta property="og:url" content=")[^"]*(")', r'\1' + url + r'\2', text)
    # og:image мог остаться относительным — домен ему обязателен
    def abs_img(m):
        v = m.group(2)
        if v.startswith('http'):
            return m.group(0)
        v = v.lstrip('./')
        v = re.sub(r'^(shared/)', r'\1', v)
        return m.group(1) + DOMAIN + '/' + v + m.group(3)
    text = re.sub(r'(<meta (?:property="og:image"|name="twitter:image") content=")([^"]*)(")', abs_img, text)
    return text


# ---------------------------------------------------------------------------
# Страницы-визитки экспонатов
#
# У девяти «якорных» объектов есть собственный адрес вида /objects/<slug>.html —
# он нужен, чтобы при отправке ссылки в мессенджер подтягивались имя, описание
# и фото именно этого экспоната (шаблон exhibit.html работает через ?id= и такой
# карточки дать не может).
#
# Раньше это были девять отдельных HTML-файлов, совпадавших с шаблоном на 96 %:
# 3825 строк, где отличались только мета-теги. Любая правка требовала десяти
# одинаковых изменений — так уже расходились кнопки, адрес почты и мёртвый код.
# Теперь страницы собираются здесь из exhibit.html, а тексты для поиска лежат
# в promo-data.js полем seo.
# ---------------------------------------------------------------------------

def object_pages():
    """Визитки лотов — данные из единой точки: relictum-sync.php?format=pages (CRM StarGift,
    таблица relictum_items). Та же функция кормит узел публикации, поэтому визитка после
    сборки среза и после «Сохранить» в CRM одинаковая: title/description из auto-SEO,
    статичный HTML для роботов, JSON-LD Product, noindex для скрытых лотов."""
    if 'pages' not in _PAGES_CACHE:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import crm_sync
        _PAGES_CACHE['pages'] = crm_sync.call('relictum-sync.php?format=pages')['pages']
    return _PAGES_CACHE['pages']


_PAGES_CACHE = {}


def render_object_page(t, pg):
    """Подстановка данных визитки в шаблон exhibit.html — зеркало node_render_page() в NODE_PHP."""
    def esc(v):
        return html.escape(str(v), quote=True)
    title, desc, img, url = esc(pg['title']), esc(pg['description']), esc(pg['image']), esc(pg['url'])

    def one(pattern, value):
        nonlocal t
        t = re.sub(pattern, lambda m: m.group(1) + value + m.group(2), t, count=1)

    t = re.sub(r'<title>.*?</title>', '<title>' + title + '</title>', t, count=1, flags=re.S)
    one(r'(<meta name="description" content=")[^"]*(")', desc)
    one(r'(<meta property="og:title" content=")[^"]*(")', title)
    one(r'(<meta property="og:description" content=")[^"]*(")', desc)
    one(r'(<meta property="og:type" content=")[^"]*(")', 'product')
    one(r'(<meta property="og:image" content=")[^"]*(")', img)
    one(r'(<meta property="og:url" content=")[^"]*(")', url)
    one(r'(<link rel="canonical" href=")[^"]*(")', url)
    one(r'(<meta name="twitter:title" content=")[^"]*(")', title)
    one(r'(<meta name="twitter:description" content=")[^"]*(")', desc)
    one(r'(<meta name="twitter:image" content=")[^"]*(")', img)
    head = '<script>window.RL_FORCE_ID=' + json.dumps(pg['id'], ensure_ascii=False) + ';</script>\n' + pg.get('jsonld', '') + '\n'
    if pg.get('noindex'):
        head += '<meta name="robots" content="noindex,follow">\n'   # архив: вне выдачи, ссылки на соседние лоты работают
    t = t.replace('</head>', head + '</head>', 1)
    t = re.sub(r'<main id="app">.*?</main>', lambda m: '<main id="app">' + pg.get('ssr', '') + '</main>', t, count=1, flags=re.S)
    return t


def write_object_pages(template_text, out_dir, stamp):
    """Пишет objects/<slug>.html; возвращает только индексируемые (для sitemap)."""
    made = []
    for pg in sorted(object_pages(), key=lambda x: x['slug']):
        open(os.path.join(out_dir, pg['slug'] + '.html'), 'w', encoding='utf-8').write(render_object_page(template_text, pg))
        if not pg.get('noindex'):
            made.append('objects/' + pg['slug'] + '.html')
    return made


def build():
    stamp = data_stamp()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    pages = []
    for src_dir, dst_dir, keep in COPY:
        s = os.path.join(ROOT, src_dir)
        d = os.path.join(OUT, dst_dir) if dst_dir else OUT
        os.makedirs(d, exist_ok=True)
        for f in sorted(os.listdir(s)):
            if f.startswith('_') or not os.path.isfile(os.path.join(s, f)) or not keep(f):
                continue   # _*.html — шаблоны, в срез не копируются
            rel = os.path.join(dst_dir, f) if dst_dir else f
            text = open(os.path.join(s, f), encoding='utf-8').read()
            text = rewrite_links(text, dst_dir)
            if f.endswith('.html'):
                text = fix_meta(text, rel)
                text = stamp_scripts(text, stamp)
                pages.append(rel.replace(os.sep, '/'))
            open(os.path.join(d, f), 'w', encoding='utf-8').write(text)

    # /eras/ без файла отдавал 403 — индекс папки ведёт на хаб эпох
    open(os.path.join(OUT, 'eras', 'index.html'), 'w', encoding='utf-8').write(
        '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Эпохи — RELICTUM</title>'
        '<link rel="canonical" href="' + DOMAIN + '/eras/eras.html"><meta http-equiv="refresh" content="0; url=/eras/eras.html">'
        '</head><body><a href="/eras/eras.html">Эпохи RELICTUM</a></body></html>\n')

    # страницы-визитки экспонатов собираются из exhibit.html (см. object_pages)
    tpl_path = os.path.join(OUT, 'objects', 'exhibit.html')
    tpl = open(tpl_path, encoding='utf-8').read()
    pages += write_object_pages(tpl, os.path.join(OUT, 'objects'), stamp)
    open(os.path.join(OUT, 'objects', '_resolve.php'), 'w', encoding='utf-8').write(RESOLVE_PHP)

    # медиа и общие скрипты
    shutil.copytree(os.path.join(ROOT, 'shared'), os.path.join(OUT, 'shared'),
                    ignore=shutil.ignore_patterns('*.md'))

    # catalog.js ведёт на промо — путь считается от корня домена
    cat = os.path.join(OUT, 'shared', 'catalog.js')
    t = open(cat, encoding='utf-8').read().replace('../16_product_promos/', 'objects/')
    open(cat, 'w', encoding='utf-8').write(t)

    # shop.js определял «этаж» по имени старых папок — учим новой раскладке
    shop = os.path.join(OUT, 'shared', 'shop.js')
    t = open(shop, encoding='utf-8').read()
    t = t.replace("if(p.indexOf('/02_site_v1_gallery/')>=0) return '';", "if(p.indexOf('/objects/')<0&&p.indexOf('/eras/')<0&&p.indexOf('/provenance/')<0) return '';")
    t = t.replace("if(p.indexOf('/16_product_promos/')>=0) return '../02_site_v1_gallery/';", "return '../';")
    t = t.replace("return '02_site_v1_gallery/';", "return '';")
    open(shop, 'w', encoding='utf-8').write(t)

    prerender_catalog()
    pages += write_collections(stamp)   # подарочные, интерьерные и категорийные посадочные
    pages += write_faq(stamp)           # /faq.html из 09_admin/faq.json
    journal_seo()                       # Article + дата + og:image у статей журнала
    write_page_i18n()                   # shared/i18n-pages.js — переводы главной, подарков, посадочных и журнала
    seo_links()                         # подвал → посадочные, лоты → канон, index.html → /
    write_focus_map()
    dropped = prune_media()
    inject_metrika()   # Яндекс Метрика 112568027 + цели по кликам на телефон/WhatsApp
    stamp_media(OUT)   # ?v=<хэш файла> у картинок и видео — иначе кэш держит старое
    img_dims()         # width/height у <img> — без «прыжков» страницы при загрузке
    webp_pictures()    # WebP рядом с JPEG и <picture> — картинки вдвое легче
    pages += lang_versions()   # /en/ /zh/ /ar/ — статичные переводы + hreflang
    write_extras(pages)
    return pages, stamp, dropped


# Медиа, которое лежит в репозитории, но на публичных страницах не встречается,
# в срез не попадает: это библиотека промо-роликов, кадры для PDF и черновые
# генерации. В репозитории они остаются, на хостинг не уезжают.
MEDIA_EXT = ('.jpg', '.jpeg', '.png', '.mp4', '.webp', '.gif', '.svg', '.ico')
KEEP_DIRS = ('shared/brand',)          # логотипы и фавиконы не трогаем никогда


# ---------------------------------------------------------------------------
# Версия у медиа в адресе
#
# Картинки и видео отдаются с кэшем на 30 дней (.htaccess). Если файл перезаписан
# под тем же именем, у постоянного посетителя месяц остаётся старая копия — так и
# случилось с переснятыми роликами эр. Поэтому к каждой ссылке дописывается ?v=
# с хэшем СОДЕРЖИМОГО этого файла: поменялся файл — поменялся адрес, не менялся —
# кэш продолжает работать.
# ---------------------------------------------------------------------------
MEDIA_STAMP_EXT = ('.mp4', '.jpg', '.jpeg', '.png', '.webp')
MEDIA_ATTR = re.compile(
    r'((?:src|poster|data-src|data-src-m|data-poster-m)=")([^"?]+?\.(?:mp4|jpg|jpeg|png|webp))(")', re.I)


def stamp_media(out_dir):
    import hashlib
    cache = {}

    def digest(abs_path):
        if abs_path not in cache:
            try:
                with open(abs_path, 'rb') as fh:
                    cache[abs_path] = hashlib.sha1(fh.read()).hexdigest()[:8]
            except OSError:
                cache[abs_path] = None
        return cache[abs_path]

    touched = 0
    for root, _, files in os.walk(out_dir):
        for f in files:
            if not f.endswith('.html'):
                continue
            page = os.path.join(root, f)
            text = open(page, encoding='utf-8').read()

            def add(m):
                url = m.group(2)
                target = (os.path.join(out_dir, url.lstrip('/')) if url.startswith('/')
                          else os.path.normpath(os.path.join(root, url)))
                d = digest(target)
                return m.group(0) if d is None else m.group(1) + url + '?v=' + d + m.group(3)

            new = MEDIA_ATTR.sub(add, text)
            if new != text:
                open(page, 'w', encoding='utf-8').write(new)
                touched += 1
    return touched


def make_tile(src, img_dir, name):
    """Собирает горизонтальную плитку 3:2 из вертикального кадра.

    Кадр ставится целиком по центру, а поля по бокам заполняются продолжением
    его же фона: каждая строка полей красится цветом крайнего пикселя этой
    строки и слегка размывается. Стыка нет по построению — на границе цвета
    совпадают пиксель в пиксель, а дальше фон плавно уходит в поле.
    """
    import numpy as np
    from PIL import Image, ImageFilter
    a = np.asarray(src.convert('RGB')).astype(np.uint8)
    h, w = a.shape[:2]
    W = int(round(h * 3 / 2))
    if W <= w:
        return
    pad = (W - w) // 2
    out = np.zeros((h, W, 3), dtype=np.uint8)
    out[:, pad:pad + w] = a

    edge = np.concatenate([a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    if edge.std() < 26:
        # Студийный кадр: фон ровный, продолжаем его построчно — на стыке
        # цвета совпадают пиксель в пиксель, шва нет по построению.
        out[:, :pad] = a[:, :1]
        out[:, pad + w:] = a[:, -1:]
    else:
        # Сцена «при жизни» или интерьер: построчная растяжка даёт горизонтальные
        # смазы. Поля заполняем зеркальным продолжением самого кадра.
        left = a[:, :pad][:, ::-1] if pad <= w else np.tile(a[:, ::-1], (1, pad // w + 1, 1))[:, :pad]
        right = a[:, -pad:][:, ::-1] if pad <= w else np.tile(a[:, ::-1], (1, pad // w + 1, 1))[:, :pad]
        out[:, :pad] = left
        out[:, pad + w:] = right

    im = Image.fromarray(out)
    bg = im.filter(ImageFilter.GaussianBlur(18))
    bg.paste(Image.fromarray(a), (pad, 0))   # сам кадр остаётся резким
    bg.save(os.path.join(img_dir, 'tile_' + name), quality=88)


_MEDIA_STAMP = None


def media_stamp():
    """Версия медиатеки: имена и размеры файлов shared/img.

    Картинки перезаписываются под теми же именами; без версии в адресе браузер
    неделями показывает из кэша прежний кадр — правка «не доходит».
    """
    global _MEDIA_STAMP
    if _MEDIA_STAMP:
        return _MEDIA_STAMP
    import hashlib
    d = os.path.join(ROOT, 'shared', 'img')      # считаем по исходной медиатеке:
    h = hashlib.sha1()                            # срез собирается в несколько шагов,
    for f in sorted(os.listdir(d)):               # и версия должна быть одна на всю сборку
        h.update(f.encode('utf-8'))
        h.update(str(os.path.getsize(os.path.join(d, f))).encode('utf-8'))
    _MEDIA_STAMP = h.hexdigest()[:8]
    return _MEDIA_STAMP


def write_focus_map():
    """Считает вертикальную посадку объекта в каждом кадре галереи.

    Плитка галереи горизонтальная (3:2), а каноны, чертежи и реконструкции
    вертикальные (4:5) — часть высоты неизбежно уходит под обрез. Обрезка по
    центру холста режет то постамент, то голову: объект сидит в кадре по-разному.
    Поэтому считаем, где объект реально находится, и центрируем в окне ЕГО, а не
    холст. Результат — карта {файл: object-position Y в процентах} в focus.js.
    """
    import json
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        print('   focus.js пропущен: нет numpy/Pillow')
        return
    img_dir = os.path.join(OUT, 'shared', 'img')
    focus = {}
    for f in sorted(os.listdir(img_dir)):
        if not f.endswith('.jpg') or not f.startswith(('ph_', 'anat_', 'life_', 'situ_')):
            continue
        try:
            src = Image.open(os.path.join(img_dir, f))
            im = src.convert('L')
        except Exception:
            continue
        w, h = im.size
        if w >= h:                      # горизонтальные кадры не обрезаются
            continue
        a = np.asarray(im).astype(float)
        border = np.concatenate([a[:8].ravel(), a[-8:].ravel()])
        bg = np.median(border)
        if border.std() > 34:           # кадр без ровного фона (сцена «при жизни»,
            continue                    # интерьер) — обрезать по центру безопасно
        rows = (np.abs(a - bg) > 26).mean(axis=1)
        ys = np.flatnonzero(rows > 0.02)
        if len(ys) == 0:
            continue
        top, bot = ys[0] / h, ys[-1] / h
        centre = (top + bot) / 2
        vis = (2 / 3) * (w / h)         # какая доля высоты видна в плитке 3:2
        if vis >= 1:
            continue
        if bot - top > vis - 0.02:
            # Объект выше видимого окна (медведь, стоящий во весь кадр): любая
            # обрезка режет либо голову, либо лапы. Вписываем целиком — фон
            # студийного кадра совпадает с цветом плитки, стыка не видно.
            make_tile(src, img_dir, f)
            focus[f] = 'tile'           # плитка собрана отдельно, кадр в ней целиком
            continue
        p = (centre - vis / 2) / (1 - vis)
        focus[f] = round(max(0.0, min(1.0, p)) * 100)
    # Версия медиатеки. Картинки перезаписываются под теми же именами, и без
    # неё браузер отдаёт из кэша старый кадр — правку не видно неделями.
    mv = media_stamp()

    path = os.path.join(OUT, 'shared', 'focus.js')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('window.RELICTUM_FOCUS = ' + json.dumps(focus, ensure_ascii=False) + ';\n')
        fh.write("window.RELICTUM_MV = '" + mv + "';\n")
    print(f'   версия медиатеки: {mv}')
    print(f'   focus.js: посадка посчитана для {len(focus)} кадров')


def prerender_catalog():
    """Впечатывает карточки каталога в HTML при сборке.

    Каталог рендерится клиентским JS, поэтому поисковики, LLM-агенты и любой
    клиент без JS видели пустую сетку — и делали вывод, что экспонаты
    «не опубликованы». Здесь та же разметка, что строит render() в
    catalog.html, генерируется заранее и кладётся в #grid; скрипт при загрузке
    просто перерисует её же. Данные берём из УЖЕ переписанного
    public/shared/catalog.js — ссылки там ведут на objects/.
    """
    import json
    # Порядок карточек считает shared/order.js — тот же файл, что и на
    # странице. Своя реализация здесь означала бы две расходящиеся копии и
    # перестроение сетки после загрузки.
    js = ("global.window={};"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'shared','order.js'))},'utf8'));"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'shared','catalog.js'))},'utf8'));"
          "var c=window.RELICTUM_CATALOG.filter(function(o){return !o.hidden})"
          ".map(function(o){o.avail=(o.status==='Под заказ')?'Под заказ':'В наличии';return o});"
          "process.stdout.write(JSON.stringify(window.RELICTUM_ORDER.arrange(c)));")
    items = json.loads(subprocess.run(['node','-e',js],capture_output=True,text=True,check=True).stdout)

    def esc(x): return str(x).replace('&','&amp;').replace('<','&lt;').replace('"','&quot;')

    cards = []
    for n, o in enumerate(items):
        href = o.get('href') or ('object.html?id=' + o['id'])
        lazy = '' if n < 4 else ' loading="lazy"'
        img, name, world = o['img'], o['name'], o['worldLabel']
        latin, meta, price = o.get('latin', ''), o.get('meta', ''), o.get('price', '')
        cards.append(
            '<a class="obj-card" href="' + esc(href) + '">'
            '<div class="ph">' + (('<span class="badge">' + esc(o['status']) + '</span>') if o.get('status') else '')
            + '<img src="shared/img/' + img + '.jpg?v=' + media_stamp() + '" alt="' + esc(name) + '"' + lazy + ' decoding="async"></div>'
            '<div class="body"><div class="id">' + o['id'] + ', ' + esc(world) + '</div>'
            '<h3>' + esc(name) + '</h3><div class="latin">' + esc(latin) + '</div>'
            '<div class="meta">' + meta + '</div>'
            '<div class="price"><b>' + esc(price) + '</b><span>Смотреть</span></div></div></a>')
    p = os.path.join(OUT, 'catalog.html')
    t = open(p, encoding='utf-8').read()
    t = t.replace('<div class="grid-objects compact" id="grid"></div>',
                  '<div class="grid-objects compact" id="grid">' + ''.join(cards) + '</div>', 1)
    t = t.replace('<div class="rail-count" id="count"></div>',
                  f'<div class="rail-count" id="count">Объектов: {len(items)}</div>', 1)
    open(p, 'w', encoding='utf-8').write(t)


# ---------------------------------------------------------------------------
# Посадочные страницы: подарки, интерьер, узкие категории (10.09.2026).
#
# Заход «со стороны подарка» как у StarGift и Люкс Подарков: «подарок директору»,
# «VIP-подарок», «метеорит в подарок», «интерьерные решения», плюс узкие категории
# под коммерческие запросы («купить метеорит», «череп динозавра»). Подборки
# считаются из каталога правилами ниже — руками ничего не ведётся; тексты
# страниц лежат в 09_admin/landing_copy.json (пишутся по правилам дома).
# ---------------------------------------------------------------------------
def _has(o, *cats): return o['category'] in cats
def _pv(o): return o.get('priceValue') or 0
def _nm(o, pat): return re.search(pat, o['name'], re.I) is not None

# 06.10.2026 (владелец): страницы собираются и доступны по адресу, но в списки подборок
# (ряд в каталоге, плитки хаба, «Смотрите также») не выводятся
UNLISTED_LANDINGS = {'chelyabinskij-meteorit', 'zub-megalodona'}
LANDINGS = [
    # slug, группа (gift|interior|category), правило отбора, максимум карточек
    ('podarok-direktoru',    'gift',     lambda o, P: _has(o, 'Метеориты', 'Минералы', 'Аммониты', 'Жеоды') and 150_000 <= _pv(o) <= 3_000_000, 24),
    ('podarok-muzhchine',    'gift',     lambda o, P: _has(o, 'Динозавры', 'Мегалодон', 'Саблезубые кошки', 'Метеориты', 'Морские рептилии') and 0 < _pv(o) <= 5_000_000, 24),
    ('podarok-kollekcioneru','gift',     lambda o, P: _has(o, 'Динозавры', 'Морские рептилии', 'Трилобиты', 'Ископаемые рыбы', 'Эдиакарская фауна', 'Ракоскорпионы', 'Крокодилиформы', 'Древние киты', 'Аммониты'), 24),
    ('vip-podarok',          'gift',     lambda o, P: _pv(o) >= 2_000_000 or o['world'] == 'grand', 24),
    ('podarok-na-yubiley',   'gift',     lambda o, P: _has(o, 'Метеориты', 'Аммониты', 'Минералы', 'Ископаемая древесина', 'Бабочки') and 80_000 <= _pv(o) <= 1_500_000, 24),
    ('meteorit-v-podarok',   'gift',     lambda o, P: _has(o, 'Метеориты'), 24),
    ('interernye-resheniya', 'interior', lambda o, P: bool((P.get(o['id']) or {}).get('interior', {}).get('img')) and (o['world'] == 'grand' or _has(o, 'Динозавры', 'Мамонтовая фауна', 'Минералы', 'Жеоды', 'Аммониты', 'Морские рептилии')), 30),
    ('meteority',            'category', lambda o, P: _has(o, 'Метеориты'), 999),
    ('dinozavry',            'category', lambda o, P: _has(o, 'Динозавры'), 999),
    ('mamontovaya-fauna',    'category', lambda o, P: _has(o, 'Мамонтовая фауна'), 999),
    ('mineraly',             'category', lambda o, P: _has(o, 'Минералы', 'Жеоды'), 999),
    ('ammonity',             'category', lambda o, P: _has(o, 'Аммониты'), 999),
    ('morskie-reptilii',     'category', lambda o, P: _has(o, 'Морские рептилии', 'Ихтиозавры') or _nm(o, r'ихтиозавр|мозазавр|кейхозавр|миксозавр'), 999),
    ('cherepa',              'category', lambda o, P: _nm(o, r'череп'), 999),
    ('skelety',              'category', lambda o, P: _nm(o, r'скелет'), 999),
    ('zuby-i-kogti',         'category', lambda o, P: _nm(o, r'\bзуб(?!р)|когот|когт|мегалодон'), 999),
    # узкие разделы под коммерческие запросы, где сайта не было в выдаче (аудит 05.10.2026)
    ('bivni-mamonta',        'category', lambda o, P: _nm(o, r'бив[ен]'), 999),
    ('pallasity',            'category', lambda o, P: _has(o, 'Метеориты') and (_nm(o, r'палласит|сеймчан') or re.search(r'pallasite', o.get('latin') or '', re.I) is not None), 999),
    ('chelyabinskij-meteorit', 'category', lambda o, P: _nm(o, r'челябинск'), 999),
    ('trilobity',            'category', lambda o, P: _has(o, 'Трилобиты'), 999),
    ('zub-megalodona',       'category', lambda o, P: _has(o, 'Мегалодон'), 999),
]


def arranged_items():
    """Видимые лоты в порядке витрины (shared/order.js) + промо — из уже переписанного public/."""
    import json
    js = ("global.window={};"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'shared','order.js'))},'utf8'));"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'shared','catalog.js'))},'utf8'));"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'objects','promo-data.js'))},'utf8'));"
          "var c=window.RELICTUM_CATALOG.filter(function(o){return !o.hidden});"
          "process.stdout.write(JSON.stringify({items:window.RELICTUM_ORDER.arrange(c),promo:window.RELICTUM_PROMO}));")
    d = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    return d['items'], d['promo']


def esc_html(x): return str(x).replace('&', '&amp;').replace('<', '&lt;').replace('"', '&quot;')


def card_html(o, n, src=None):
    href = o.get('href') or ('object.html?id=' + o['id'])
    lazy = '' if n < 6 else ' loading="lazy"'
    src = src or ('shared/img/' + o['img'] + '.jpg')
    return ('<a class="obj-card" href="' + esc_html(href) + '">'
            '<div class="ph">' + (('<span class="badge">' + esc_html(o['status']) + '</span>') if o.get('status') else '')
            + '<img src="' + src + '?v=' + media_stamp() + '" alt="' + esc_html(o['name']) + '"' + lazy + ' decoding="async"></div>'
            '<div class="body"><div class="id">' + o['id'] + ', ' + esc_html(o['worldLabel']) + '</div>'
            '<h3>' + esc_html(o['name']) + '</h3><div class="latin">' + esc_html(o.get('latin') or '') + '</div>'
            '<div class="meta">' + (o.get('meta') or '') + '</div>'
            '<div class="price"><b>' + esc_html(o.get('price') or '') + '</b><span>Смотреть</span></div></div></a>')


def write_collections(stamp):
    import json
    copy_path = os.path.join(ROOT, '09_admin', 'landing_copy.json')
    if not os.path.exists(copy_path):
        print('  ! landing_copy.json нет — посадочные не собраны'); return []
    copy = json.load(open(copy_path, encoding='utf-8'))
    tpl = open(os.path.join(ROOT, '02_site_v1_gallery', '_collection.tpl.html'), encoding='utf-8').read()
    tpl = stamp_scripts(rewrite_links(tpl, ''), stamp)
    items, promo = arranged_items()
    made, tiles, used_imgs = [], [], set()

    def render(slug, c, cards, count, og_image, related, jsonld, hero_img, split_img, grid_title, wide=False, sub='', extra='', page_items=None, order_block=''):
        faq_html, faq_ld = faq_block(c, page_items)
        jsonld = jsonld + faq_ld
        hero_cta, pitch_top, pitch_bottom = pitch_blocks(c)
        t = tpl
        intro = list(c['intro']) + ['', '']
        for k, v in {'{{TITLE}}': esc_html(c['title']), '{{DESC}}': esc_html(c['description']), '{{URL}}': DOMAIN + '/' + slug + '.html',
                     '{{OG_IMAGE}}': og_image, '{{KICKER}}': esc_html(c['kicker']), '{{H1}}': esc_html(c['h1']),
                     '{{INTRO1}}': esc_html(intro[0]), '{{INTRO2}}': esc_html(intro[1]), '{{COUNT}}': str(count),
                     '{{CARDS}}': cards, '{{CTA}}': esc_html(c['cta']), '{{SEO_TEXT}}': esc_html(c['seo_text']),
                     '{{RELATED}}': related, '{{JSONLD}}': jsonld, '{{GRID_TITLE}}': esc_html(grid_title),
                     '{{HERO_IMG}}': hero_img + '?v=' + media_stamp(), '{{HERO_ALT}}': esc_html(c['h1']),
                     '{{SPLIT_IMG}}': split_img + '?v=' + media_stamp(), '{{SPLIT_ALT}}': esc_html(c['kicker']),
                     '{{GRID_CLASS}}': ' lp-wide' if wide else '',
                     '{{SUB}}': sub, '{{GIFT_INTERIOR}}': extra, '{{FAQ}}': faq_html,
                     '{{HERO_CTA}}': hero_cta, '{{PITCH_TOP}}': pitch_top, '{{PITCH_BOTTOM}}': pitch_bottom,
                     '{{ORDER_BLOCK}}': order_block}.items():
            t = t.replace(k, v)
        if slug == 'interernye-resheniya':   # у интерьерной подборки своя форма подбора
            t = t.replace('href="request.html">Персональный подбор', 'href="interior-request.html">Подбор в интерьер', 1)
        if pitch_bottom:  # у продающей страницы свой блок сервиса — общий «Сервис дома» дублировал бы его
            t = re.sub(r'<!-- СЕРВИС ДОМА -->\s*<section class="band-dark">.*?</section>\s*', '', t, count=1, flags=re.S)
        if not related:   # на хабе все подборки уже плитками — «Смотрите также» лишний
            t = re.sub(r'\s*<div class="label reveal" style="margin-top:40px">Смотрите также</div>\s*<ul class="lp-chips reveal"></ul>', '', t, count=1)
        open(os.path.join(OUT, slug + '.html'), 'w', encoding='utf-8').write(t)
        made.append(slug + '.html')

    def ld(obj): return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + '</script>'

    # Цифры для ответов FAQ считаются из каталога — текст в landing_copy.json не устаревает
    prices = sorted(o['priceValue'] for o in items if o.get('priceValue'))
    rub = lambda v: f'{v:,}'.replace(',', ' ') + ' ₽'
    facts = {'count': len(items), 'min_price': rub(prices[0]) if prices else '',
             'under_500k': sum(1 for v in prices if v <= 500_000), 'over_10m': sum(1 for v in prices if v >= 10_000_000)}

    def faq_block(c, page_items=None):
        """Блок «Частые вопросы» + FAQPage JSON-LD — только если у страницы в landing_copy.json есть faq.
        Кроме общих цифр каталога доступны цифры самой подборки: {n} — лотов, {price_range} — «от … до …»."""
        f, pp = dict(facts), None
        if page_items is not None:
            pp = sorted(o['priceValue'] for o in page_items if o.get('priceValue'))
            f['n'] = len(page_items)
            f['price_range'] = price_range(pp, rub)
        qa = [(q, fmt_tr(a, f, pp, rub)) for q, a in c.get('faq', [])]
        if not qa:
            return '', ''
        body = ''.join(f'<h3>{esc_html(q)}</h3><p>{esc_html(a)}</p>' for q, a in qa)
        block = ('<section class="lp-about"><div class="wrap"><div class="section-head reveal"><div>'
                 '<div class="label">Вопросы и ответы</div><h2>Частые вопросы</h2></div></div>'
                 '<div class="lp-faq reveal">' + body + '</div></div></section>')
        return block, '\n' + ld({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa]})

    def pitch_blocks(c):
        """Продающие блоки по образцу stargift.ru/vip: кнопки в хиро, «почему это сильный подарок»,
        сервис с фото (зигзаг), полоса доверия, финальный призыв. Всё из landing_copy.json;
        блок без текста не выводится — так в JSON можно держать заготовки под будущие услуги."""
        btn = lambda label, href, light=False: (f'<a class="btn{" btn-solid" if light else ""}" href="{esc_html(href)}"'
                                               + (' target="_blank" rel="noopener"' if href.startswith('http') else '') + f'>{esc_html(label)}</a>')
        hero = ''
        if c.get('hero_cta'):
            hero = ('<div class="lp-hero-cta reveal on-dark">' + btn('Подобрать подарок', 'request.html', True)
                    + btn('Написать в WhatsApp', 'https://wa.me/74952335111') + '</div>')
        usp = [(t, x) for t, x in c.get('usp', []) if x]
        top = ''
        if usp:
            top = ('<section><div class="wrap"><div class="section-head reveal"><div><div class="label">' + esc_html(c.get('usp_label', 'Почему это сильный подарок'))
                   + '</div><h2>' + esc_html(c.get('usp_title', '')) + '</h2></div></div><div class="lp-usp reveal">'
                   + ''.join(f'<div><div class="num">{i + 1:02d}</div><h3>{esc_html(t)}</h3><p>{esc_html(x)}</p></div>' for i, (t, x) in enumerate(usp))
                   + '</div></div></section>')
        rows = [r for r in c.get('services', []) if r.get('text')]
        bottom = ''
        if rows:
            bottom += ('<section><div class="wrap"><div class="section-head reveal"><div><div class="label">Сервис дома</div><h2>'
                       + esc_html(c.get('services_title', 'Персональный сервис')) + '</h2></div></div><div class="lp-svc">')
            for r in rows:
                img = (f'<div class="media"><img src="shared/img/{r["img"]}?v={media_stamp()}" alt="{esc_html(r["title"])}" loading="lazy" decoding="async"></div>'
                       if r.get('img') else '<div class="media"></div>')
                cta = btn(r['cta'], r['href']) if r.get('cta') and r.get('href') else ''
                bottom += (f'<div class="row reveal">{img}<div><div class="label">{esc_html(r.get("kicker", ""))}</div>'
                           f'<h3>{esc_html(r["title"])}</h3><p>{esc_html(r["text"])}</p><div style="margin-top:20px">{cta}</div></div></div>')
            bottom += '</div></div></section>'
        tr = c.get('trust') or {}
        if tr.get('text'):
            bottom += ('<section class="band-dark lp-trust"><div class="wrap reveal"><div class="label" style="color:var(--bronze)">'
                       + esc_html(tr.get('label', 'О нас пишут')) + '</div><blockquote>' + esc_html(tr['text']) + '</blockquote>'
                       + (btn(tr['link_label'], tr['link_href']) if tr.get('link_href') else '') + '</div></section>')
        cb = c.get('cta_band') or {}
        if cb.get('title'):
            bottom += ('<section class="lp-cta"><div class="wrap reveal"><div class="label">Персональный подбор</div><h2>' + esc_html(cb['title'])
                       + '</h2><p style="color:var(--stone);max-width:56ch;margin:14px auto 0">' + esc_html(cb.get('text', '')) + '</p>'
                       + '<div class="lp-hero-cta">' + btn('Оставить заявку', 'request.html', True) + btn('+7 495 233 5111', 'tel:+74952335111')
                       + btn('WhatsApp', 'https://wa.me/74952335111') + '</div></div></section>')
        return hero, top, bottom

    def interior_strip(lots, skip=(), title='Как подарок будет выглядеть у получателя'):
        """Подарок в интерьере: до 4 кадров «в доме/кабинете» из подборки со ссылкой на лот.
        Студийное фото показывает предмет, интерьерное — что он сделает с пространством."""
        shots, seen = [], set(skip)
        for o in lots:
            img = (promo.get(o['id']) or {}).get('interior', {}).get('img')
            if img and img not in seen:
                seen.add(img)
                shots.append((o, img))
            if len(shots) == 4:
                break
        if len(shots) < 2:
            return ''
        cells = ''.join(f'<a href="objects/{o["slug"]}.html"><img src="shared/img/{img}?v={media_stamp()}" alt="{esc_html(o["name"])} в интерьере" loading="lazy" decoding="async"><span>{esc_html(o["name"])}</span></a>'
                        for o, img in shots)
        return ('<section class="lp-grid"><div class="wrap"><div class="section-head reveal"><div>'
                '<div class="label">Подарок в интерьере</div><h2>' + title + '</h2></div>'
                '<p class="sub">Так предмет выглядит не на витрине, а в доме или кабинете: проще оценить масштаб и выбрать место — стол, полку или нишу.</p></div>'
                '<div class="lp-int reveal">' + cells + '</div></div></section>')
    # Категории («Метеориты», «Черепа»…) — разделы каталога, а не подарочные подборки:
    # их родитель в хлебных крошках — каталог, у подарочных и интерьерной — хаб подарков.
    def crumbs(name, url, group):
        parent = ('Каталог', DOMAIN + '/catalog.html') if group == 'category' else ('Подарки и интерьер', DOMAIN + '/podarki.html')
        return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'RELICTUM', 'item': DOMAIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': parent[0], 'item': parent[1]},
            {'@type': 'ListItem', 'position': 3, 'name': name, 'item': url}]}

    for slug, group, rule, cap in LANDINGS:
        c = copy.get(slug)
        if not c:
            print('  ! нет текста для', slug); continue
        # 06.10.2026 (владелец): в подборках только то, что есть в галерее — подпись обещает «все доступны к просмотру»
        sel = [o for o in items if rule(o, promo) and o.get('status') != 'Под заказ'][:cap]
        # 07.10.2026 (владелец): лоты «Под заказ» той же подборки — отдельным блоком под основной сеткой
        sel_order = [o for o in items if rule(o, promo) and o.get('status') == 'Под заказ'][:cap]
        order_block = ''
        if sel_order:
            order_block = ('<div class="lp-order reveal" style="margin-top:clamp(48px,6vw,84px)">'
                           '<div class="section-head"><div><div class="label">Также в коллекции</div><h2>Под заказ</h2></div>'
                           '<p class="sub">' + esc_html(fmt_tr('Экспонатов: {n}. Срок и условия поставки уточнит менеджер галереи.', {'n': len(sel_order)})) + '</p></div>'
                           '<div class="grid-objects compact">' + ''.join(card_html(o, 99 + n, src=('shared/img/' + promo[o['id']]['interior']['img']) if group == 'interior' else None) for n, o in enumerate(sel_order)) + '</div></div>')
        if not sel:
            print('  ! пустая подборка', slug); continue
        cards = ''.join(card_html(o, n, src=('shared/img/' + promo[o['id']]['interior']['img']) if group == 'interior' else None) for n, o in enumerate(sel))
        url = DOMAIN + '/' + slug + '.html'
        og = DOMAIN + '/shared/img/' + (promo[sel[0]['id']]['interior']['img'] if group == 'interior' else sel[0]['img'] + '.jpg')
        related_slugs = [x[0] for x in LANDINGS if x[0] != slug and x[0] not in UNLISTED_LANDINGS and (x[1] == group or (group != 'category' and x[1] != 'category'))][:8]
        related = ''.join('<li><a href="' + r + '.html">' + esc_html(copy[r]['h1']) + '</a></li>' for r in related_slugs if r in copy)
        related += '<li><a href="podarki.html">Все подборки</a></li><li><a href="catalog.html">Весь каталог</a></li>'
        page_ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': c['h1'], 'url': url, 'description': c['description'],
                   'isPartOf': {'@id': DOMAIN + '/#site'}, 'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(sel), 'itemListElement': [
                       {'@type': 'ListItem', 'position': n + 1, 'url': DOMAIN + '/objects/' + o['slug'] + '.html', 'name': o['name'],
                        'image': DOMAIN + '/shared/img/' + o['img'] + '.jpg'} for n, o in enumerate(sel)]}}
        ints = [promo[o['id']]['interior']['img'] for o in sel if (promo.get(o['id']) or {}).get('interior', {}).get('img')]
        # кадры хиро и сервисного блока — без повторов между подборками (иначе на хабе одна и та же плитка)
        fresh = [i for i in ints if i not in used_imgs] or ints
        hero = fresh[0] if fresh else 'int_hero_salon.jpg'; used_imgs.add(hero)
        rest = [i for i in ints if i not in used_imgs] or [i for i in ints if i != hero]
        split = rest[0] if rest else 'grand_atrium_skeleton.jpg'; used_imgs.add(split)
        hero_img = 'shared/img/' + hero
        split_img = 'shared/img/' + split
        grid_title = {'gift': 'Что подарить', 'interior': 'Предметы для пространства', 'category': 'Лоты в наличии'}[group]
        extra = interior_strip(sel, skip=(hero, split)) if group == 'gift' else ''
        render(slug, c, cards, len(sel), og, related, ld(page_ld) + '\n' + ld(crumbs(c['h1'], url, group)), hero_img, split_img, grid_title, wide=(group == 'interior'), extra=extra, page_items=sel,
               sub=fmt_tr('Экспонатов: {n}. У каждого есть паспорт происхождения, и все они доступны к просмотру в галерее.', {'n': len(sel)}),
               order_block=order_block)
        if slug not in UNLISTED_LANDINGS:
            tiles.append((slug, group, c, sel[0], len(sel), hero_img))   # плитка хаба — интерьерный кадр (3:2), не канон

    # хаб «Подарки и интерьер»
    hub = copy.get('podarki')
    if hub and tiles:
        cards = ''
        for n, (slug, group, c, first, cnt, og) in enumerate(tiles):
            cards += ('<a class="obj-card" href="' + slug + '.html"><div class="ph"><img src="' + og + '?v=' + media_stamp() + '" alt="' + esc_html(c['h1']) + '"' + ('' if n < 6 else ' loading="lazy"') + ' decoding="async"></div>'
                      '<div class="body"><div class="id">' + {'gift': 'Подарок', 'interior': 'Интерьер', 'category': 'Коллекция'}[group] + '</div><h3>' + esc_html(c['h1']) + '</h3>'
                      '<div class="meta">' + esc_html(c['description']) + '</div><div class="price"><b>Объектов: ' + str(cnt) + '</b><span>Смотреть</span></div></div></a>')
        url = DOMAIN + '/podarki.html'
        page_ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': hub['h1'], 'url': url, 'description': hub['description'], 'isPartOf': {'@id': DOMAIN + '/#site'}}
        render('podarki', hub, cards, len(tiles), DOMAIN + '/shared/img/int_hero_salon.jpg', '', ld(page_ld), 'shared/img/int_hero_salon.jpg', 'shared/img/grand_atrium_skeleton.jpg', 'Подборки по поводу и пространству', wide=True, sub=fmt_tr('Подборок: {n}. Экспонаты каждой из них доступны к просмотру в галерее.', {'n': len(tiles)}),
               extra=interior_strip([o for o in items if any(r(o, promo) for _s, g, r, _c in LANDINGS if g == 'gift')],
                                    skip=('int_hero_salon.jpg',), title='Подарок, который становится частью интерьера'))
    print(f'  посадочных: {len(made)}')
    return made


# ---------------------------------------------------------------------------
# Перелинковка для поиска (SEO-аудит, 05.10.2026)
#
# 1. Посадочные категорий («Метеориты», «Скелеты»…) ссылались только друг на друга
#    и с хаба подарков — из меню, каталога и карточек на них не вело ничего, и
#    поисковик считал их второстепенными. Колонка «Коллекции» в подвале теперь
#    ведёт на них со всех страниц, а над сеткой каталога — ряд разделов.
# 2. Ссылки на лоты вели на /objects/exhibit.html?id=<slug>. Адрес работает
#    (.htaccess отдаёт визитку), но canonical у визитки — /objects/<slug>.html,
#    и поисковик получал два адреса одной страницы. Ссылаемся сразу на канон —
#    только если визитка на самом деле собрана.
# 3. Ссылки на index.html — на корень папки: главная одна, «/».
# Делается после сборки по готовым страницам: так правка не зависит от того,
# как устроена разметка конкретной страницы.
# ---------------------------------------------------------------------------
SECTION_LINKS = [            # slug посадочной, подпись — порядок в подвале и на каталоге
    ('meteority', 'Метеориты'), ('dinozavry', 'Динозавры'), ('skelety', 'Скелеты'),
    ('cherepa', 'Черепа'), ('zuby-i-kogti', 'Зубы и когти'), ('mamontovaya-fauna', 'Мамонтовая фауна'),
    ('morskie-reptilii', 'Морские рептилии'), ('ammonity', 'Аммониты'), ('mineraly', 'Минералы'),
    ('pallasity', 'Палласиты'), ('bivni-mamonta', 'Бивни мамонта'), ('trilobity', 'Трилобиты'),
]
FOOTER_SECTIONS = ['meteority', 'dinozavry', 'skelety', 'cherepa', 'mamontovaya-fauna', 'ammonity', 'mineraly']
EXHIBIT_LINK = re.compile(r'href="((?:\.\./)?(?:objects/)?)exhibit\.html\?id=([0-9a-z-]+)"')


def seo_links():
    labels = dict(SECTION_LINKS)
    have = {f[:-5] for f in os.listdir(os.path.join(OUT, 'objects')) if f.endswith('.html')}
    sections = [s for s, _ in SECTION_LINKS if os.path.exists(os.path.join(OUT, s + '.html'))]
    changed = 0
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            if not f.endswith('.html'):
                continue
            p = os.path.join(dp, f)
            depth = os.path.relpath(p, OUT).replace(os.sep, '/').count('/')
            up = '../' * depth
            t = open(p, encoding='utf-8').read()
            n = t
            # 1. подвал: «Коллекции» → посадочные категорий + подарки
            items = ''.join(f'<li><a href="{up}{s}.html">{labels[s]}</a></li>' for s in FOOTER_SECTIONS if s in sections)
            if items:
                n = re.sub(r'(<h4>Коллекции</h4>\s*<ul>).*?(</ul>)',
                           lambda m: m.group(1) + '\n          ' + items + f'<li><a href="{up}podarki.html">Подарки и интерьер</a></li>\n        ' + m.group(2),
                           n, count=1, flags=re.S)
            # 1б. подвал: «Частые вопросы» отдельной ссылкой в колонке «Дом»
            if os.path.exists(os.path.join(OUT, 'faq.html')) and 'faq.html">Частые вопросы' not in n:
                n = re.sub(r'(<h4>Дом</h4>\s*<ul>.*?)(</ul>)',
                           lambda m: m.group(1) + f'  <li><a href="{up}faq.html">Частые вопросы</a></li>\n        ' + m.group(2), n, count=1, flags=re.S)
            # 2. лоты — на канонический адрес визитки
            n = EXHIBIT_LINK.sub(lambda m: f'href="{m.group(1)}{m.group(2)}.html"' if m.group(2) in have else m.group(0), n)
            # 3. главная — корень, а не index.html
            n = re.sub(r'href="((?:\.\./)*(?:[0-9a-z_-]+/)*)index\.html(#[^"]*)?"', lambda m: 'href="' + (m.group(1) or './') + (m.group(2) or '') + '"', n)
            if n != t:
                open(p, 'w', encoding='utf-8').write(n)
                changed += 1
    # ряд разделов над сеткой каталога
    cat = os.path.join(OUT, 'catalog.html')
    t = open(cat, encoding='utf-8').read()
    chips = ''.join(f'<li><a href="{s}.html">{labels[s]}</a></li>' for s in sections)
    row = ('<ul class="cat-sections" aria-label="Разделы коллекции" style="list-style:none;padding:0;margin:0 0 28px;display:flex;flex-wrap:wrap;gap:10px">'
           + chips + '</ul>\n      ')
    # 06.10.2026: в живой вёрстке над сеткой стоят быстрые фильтры телефона (#kindChips), а у сетки класс compact —
    # ставим ряд перед ними; на телефоне ряд скрыт (там свои фильтры-разделы), ссылки остаются в разметке
    anchor = '<div class="kind-chips" id="kindChips">' if 'id="kindChips"' in t else '<div class="grid-objects compact" id="grid">'
    assert anchor in t, 'catalog.html: не найдено место для ряда разделов'
    t = t.replace(anchor, row + anchor, 1)
    t = t.replace('</head>', '<style>.cat-sections a{display:inline-block;border:1px solid var(--hairline);padding:9px 16px;font-size:12px;'
                  'letter-spacing:.1em;text-transform:uppercase;color:inherit;text-decoration:none}'
                  '.cat-sections a:hover{border-color:var(--bronze);color:var(--bronze)}'
                  '@media(max-width:900px){.cat-sections{display:none!important}}</style>\n</head>', 1)
    open(cat, 'w', encoding='utf-8').write(t)
    print(f'  перелинковка: {changed} страниц, разделов {len(sections)}')


# ---------------------------------------------------------------------------
# Частые вопросы — отдельная страница /faq.html (05.10.2026)
#
# Вопросы и ответы лежат в 09_admin/faq.json по группам. Ответ с пустой строкой —
# заготовка: вопрос в JSON есть, на сайт не выходит, пока владелец не даст ответ.
# Оболочку (шапка, подвал, стили) берём у уже собранной oferta.html — так страница
# всегда совпадает с текущим оформлением текстовых страниц сайта.
# ---------------------------------------------------------------------------
def write_faq(stamp):
    import json
    src = os.path.join(ROOT, '09_admin', 'faq.json')
    shell_path = os.path.join(OUT, 'oferta.html')
    if not os.path.exists(src) or not os.path.exists(shell_path):
        print('  ! faq.json или oferta.html нет — страница FAQ не собрана'); return []
    d = json.load(open(src, encoding='utf-8'))
    js = ("global.window={};"
          f"eval(require('fs').readFileSync({json.dumps(os.path.join(OUT,'shared','catalog.js'))},'utf8'));"
          "process.stdout.write(JSON.stringify(window.RELICTUM_CATALOG.filter(function(o){return !o.hidden})))")
    items = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
    prices = sorted(o['priceValue'] for o in items if o.get('priceValue'))
    rub = lambda v: f'{v:,}'.replace(',', '\u00a0') + '\u00a0₽'
    facts = {'count': len(items), 'min_price': rub(prices[0]) if prices else '', 'max_price': rub(prices[-1]) if prices else '',
             'under_500k': sum(1 for v in prices if v <= 500_000), 'over_10m': sum(1 for v in prices if v >= 10_000_000),
             'on_request': sum(1 for o in items if not o.get('priceValue'))}
    body, qa_all, toc = '', [], ''
    for g in d['groups']:
        qa = [q for q in g['items'] if q[1]]
        if not qa:
            continue
        toc += f'<li><a href="#{g["id"]}">{esc_html(g["name"])}</a></li>'
        body += f'<h2 id="{g["id"]}">{esc_html(g["name"])}</h2>'
        for q in qa:
            a = q[1].format(**facts)
            link = f' <a href="{esc_html(q[2])}">{esc_html(q[3])}</a>' if len(q) > 3 and q[2] else ''
            body += f'<h3>{esc_html(q[0])}</h3><p>{esc_html(a)}{link}</p>'
            qa_all.append((q[0], a))
    url = DOMAIN + '/faq.html'
    ld = json.dumps({'@context': 'https://schema.org', '@type': 'FAQPage', 'url': url, 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa_all]}, ensure_ascii=False)
    main = ('<div class="wrap" style="padding-top:var(--head-top)">\n'
            '  <div class="crumbs" style="margin-bottom:34px"><a href="./">Главная</a>, Частые вопросы</div>\n'
            '  <div class="doc">\n    <div class="label">Вопросы и ответы</div>\n'
            f'    <h1>{esc_html(d["h1"])}</h1>\n    <p>{esc_html(d["intro"])}</p>\n'
            f'    <ul>{toc}</ul>\n    {body}\n'
            f'    <h2>Не нашли ответ?</h2><p>{esc_html(d["contact"])}</p>\n'
            '  </div>\n</div>\n\n')
    t = open(shell_path, encoding='utf-8').read()
    t = re.sub(r'<div class="wrap" style="padding-top:var\(--head-top\)">.*?(?=<footer>)', lambda m: main, t, count=1, flags=re.S)
    t = re.sub(r'<title>.*?</title>', '<title>' + esc_html(d['title']) + '</title>', t, count=1, flags=re.S)
    t = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + esc_html(d['description']) + m.group(2), t, count=1)
    for prop in ('og:title', 'twitter:title'):
        t = re.sub(r'(<meta (?:property|name)="' + prop + r'" content=")[^"]*(")', lambda m: m.group(1) + esc_html(d['title']) + m.group(2), t, count=1)
    for prop in ('og:description', 'twitter:description'):
        t = re.sub(r'(<meta (?:property|name)="' + prop + r'" content=")[^"]*(")', lambda m: m.group(1) + esc_html(d['description']) + m.group(2), t, count=1)
    # у оферты noindex и нет canonical — FAQ, наоборот, должна индексироваться
    t = re.sub(r'<meta name="robots"[^>]*>\s*', '', t)
    t = re.sub(r'<link rel="canonical"[^>]*>\s*', '', t)
    t = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), t, count=1)
    t = t.replace('</head>', '<link rel="canonical" href="' + url + '">\n<script type="application/ld+json">' + ld + '</script>\n</head>', 1)
    open(os.path.join(OUT, 'faq.html'), 'w', encoding='utf-8').write(t)
    drafts = sum(1 for g in d['groups'] for q in g['items'] if not q[1])
    print(f'  FAQ: вопросов {len(qa_all)}, заготовок без ответа {drafts}')
    return ['faq.html']



# ---------------------------------------------------------------------------
# Ширина и высота у картинок (05.10.2026)
#
# У 1177 из 1516 <img> не было width/height: браузер не знал пропорций до загрузки
# файла, и страница «прыгала» (CLS — один из Core Web Vitals). Размеры берём из
# самих файлов медиатеки; на отображение это не влияет — CSS задаёт ширину,
# а атрибуты дают только пропорции для резерва места.
# ---------------------------------------------------------------------------
IMG_TAG = re.compile(r'<img\b[^>]*>')


def img_dims():
    try:
        from PIL import Image
    except ImportError:
        print('  ! Pillow не установлен — размеры картинок не проставлены'); return
    cache, done = {}, 0
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            if not f.endswith('.html'):
                continue
            p = os.path.join(dp, f)
            t = open(p, encoding='utf-8').read()

            def add(m):
                nonlocal done
                tag = m.group(0)
                if ' width=' in tag or ' height=' in tag:
                    return tag
                src = re.search(r'\ssrc="([^"?#]+)', tag)
                if not src or src.group(1).startswith(('http', 'data:', '/')):
                    return tag
                fp = os.path.normpath(os.path.join(dp, src.group(1)))
                if fp not in cache:
                    try:
                        with Image.open(fp) as im:
                            cache[fp] = im.size
                    except Exception:
                        cache[fp] = None
                if not cache[fp]:
                    return tag
                done += 1
                w, h = cache[fp]
                return tag[:-1].rstrip('/').rstrip() + f' width="{w}" height="{h}">'

            # картинки внутри <script> (шаблоны JS) не трогаем
            parts = re.split(r'(<script\b.*?</script>)', t, flags=re.S)
            n = ''.join(x if x.startswith('<script') else IMG_TAG.sub(add, x) for x in parts)
            if n != t:
                # 06.10.2026: атрибут height браузер берёт как высоту, если стили её не задают, —
                # картинки с width:100% (интерьеры, портреты, обложки статей) вытягивались до 1000+ px.
                # Правило с самой низкой специфичностью и первым в <head>: любая высота из стилей страницы его перебивает.
                if 'img{height:auto}' not in n:
                    n = re.sub(r'(<head[^>]*>)', r'\1<style>img{height:auto}</style>', n, count=1)
                open(p, 'w', encoding='utf-8').write(n)
    print(f'  размеры картинок: {done}')



# ---------------------------------------------------------------------------
# Журнал: разметка статьи, дата, картинка для соцсетей (05.10.2026)
#
# У статей не было ни даты, ни разметки Article, а og:image у всех был один
# (череп трицератопса). Даты и главная картинка лежат в 09_admin/journal_meta.json;
# здесь они попадают в JSON-LD Article + BreadcrumbList, og:image и подпись статьи.
# ---------------------------------------------------------------------------
MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
          'сентября', 'октября', 'ноября', 'декабря']


def ru_date(iso):
    y, m, d = iso.split('-')
    return f'{int(d)} {MONTHS[int(m) - 1]} {y}'


MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
BYLINE_WORDS = {'en': ('Published {p}', ', updated {m}'), 'zh': ('发布于 {p}', '，更新于 {m}'), 'ar': ('نُشر في {p}', '، وحُدّث في {m}')}


def lang_date(iso, lang):
    y, m, d = (int(x) for x in iso.split('-'))
    return {'en': f'{d} {MONTHS_EN[m - 1]} {y}', 'zh': f'{y}年{m}月{d}日', 'ar': f'{d} {MONTHS_AR[m - 1]} {y}'}[lang]


def journal_seo():
    import json
    src = os.path.join(ROOT, '09_admin', 'journal_meta.json')
    if not os.path.exists(src):
        print('  ! journal_meta.json нет — разметка статей не добавлена'); return
    meta = json.load(open(src, encoding='utf-8'))
    done = 0
    for slug, m in meta.items():
        p = os.path.join(OUT, slug + '.html')
        if not os.path.exists(p):
            continue
        t = open(p, encoding='utf-8').read()
        url = f'{DOMAIN}/{slug}.html'
        h1 = re.search(r'<h1>(.*?)</h1>', t, re.S)
        desc = re.search(r'<meta name="description" content="([^"]*)"', t)
        headline = html.unescape(re.sub(r'<[^>]+>', '', h1.group(1))).strip() if h1 else slug
        image = f'{DOMAIN}/shared/img/{m["image"]}' if m.get('image') else ''
        org = {'@type': 'Organization', 'name': 'RELICTUM', 'url': DOMAIN + '/',
               'logo': {'@type': 'ImageObject', 'url': DOMAIN + '/shared/brand/apple-touch-icon.png'}}
        art = {'@context': 'https://schema.org', '@type': 'Article', 'headline': headline,
               'description': html.unescape(desc.group(1)) if desc else '', 'inLanguage': 'ru',
               'datePublished': m['published'], 'dateModified': m.get('modified') or m['published'],
               'author': {'@type': 'Organization', 'name': 'Редакция журнала RELICTUM', 'url': DOMAIN + '/journal.html'},
               'publisher': org, 'mainEntityOfPage': url}
        if image:
            art['image'] = [image]
        bc = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'RELICTUM', 'item': DOMAIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Журнал', 'item': DOMAIN + '/journal.html'},
            {'@type': 'ListItem', 'position': 3, 'name': headline, 'item': url}]}
        ld = ''.join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False) + '</script>\n' for x in (art, bc))
        t = t.replace('</head>', ld + '</head>', 1)
        if image:
            t = re.sub(r'(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(")', lambda mm: mm.group(1) + image + mm.group(2), t)
        t = re.sub(r'(<meta property="og:type" content=")[^"]*(")', r'\1article\2', t, count=1)
        when = 'Опубликовано ' + ru_date(m['published'])
        if m.get('modified') and m['modified'] != m['published']:
            when += ', обновлено ' + ru_date(m['modified'])
        by = re.search(r'<div class="byline">(.*?)</div>', t)
        if by:
            t = t.replace(by.group(0), '<div class="byline">' + by.group(1) + ' · ' + when + '</div>', 1)
            # перевод подписи: автор — по словарю, даты — на языке версии
            who = PAGE_TR.get(html.unescape(by.group(1)).strip())
            if who:
                res = []
                for lang, w in zip(('en', 'zh', 'ar'), who):
                    pw, mw = BYLINE_WORDS[lang]
                    tail = pw.format(p=lang_date(m['published'], lang))
                    if m.get('modified') and m['modified'] != m['published']:
                        tail += mw.format(m=lang_date(m['modified'], lang))
                    res.append(w + ' · ' + tail)
                PAGE_TR_DONE[html.unescape(by.group(1)).strip() + ' · ' + when] = res
        open(p, 'w', encoding='utf-8').write(t)
        done += 1
    print(f'  журнал: разметка у {done} статей')



# ---------------------------------------------------------------------------
# WebP рядом с JPEG (05.10.2026)
#
# Фото медиатеки отдавались только в JPEG; WebP того же качества в среднем на 50%
# легче (проверено на выборке медиатеки). Для каждой <img src="…/x.jpg"> из
# статичной разметки сборщик кладёт рядом x.webp и оборачивает картинку в
# <picture> с <source type="image/webp">: браузер без WebP возьмёт JPEG.
# picture{display:contents} — обёртка не создаёт своего блока, вёрстка как была.
# Картинки внутри <script> (шаблоны JS) и уже обёрнутые не трогаются.
# ---------------------------------------------------------------------------
WEBP_QUALITY = 80


def webp_pictures():
    try:
        from PIL import Image
    except ImportError:
        print('  ! Pillow не установлен — WebP не собраны'); return
    made, wrapped, cache = 0, 0, {}

    def webp_for(jpg_path):
        nonlocal made
        if jpg_path in cache:
            return cache[jpg_path]
        wp = jpg_path[:-4] + '.webp'
        ok = False
        try:
            if not os.path.exists(wp) or os.path.getmtime(wp) < os.path.getmtime(jpg_path):
                with Image.open(jpg_path) as im:
                    im.save(wp, 'WEBP', quality=WEBP_QUALITY, method=4)
                made += 1
            ok = os.path.getsize(wp) < os.path.getsize(jpg_path)   # WebP не легче — не используем
        except Exception:
            ok = False
        cache[jpg_path] = ok
        return ok

    for dp, _, fs in os.walk(OUT):
        for f in fs:
            if not f.endswith('.html'):
                continue
            p = os.path.join(dp, f)
            t = open(p, encoding='utf-8').read()
            count = 0

            def wrap(part):
                nonlocal count
                out, pos = [], 0
                for m in IMG_TAG.finditer(part):
                    tag = m.group(0)
                    src = re.search(r'\ssrc="([^"?#]+\.jpe?g)(\?[^"]*)?"', tag, re.I)
                    before = part[max(0, m.start() - 120):m.start()]
                    if not src or src.group(1).startswith(('http', 'data:', '/')) or '<source' in before[-80:]:
                        continue
                    fp = os.path.normpath(os.path.join(dp, src.group(1)))
                    if not os.path.exists(fp) or not webp_for(fp):
                        continue
                    web = re.sub(r'\.jpe?g$', '.webp', src.group(1), flags=re.I) + (src.group(2) or '')
                    out.append(part[pos:m.start()])
                    out.append(f'<picture><source type="image/webp" srcset="{web}">{tag}</picture>')
                    pos = m.end()
                    count += 1
                out.append(part[pos:])
                return ''.join(out)

            parts = re.split(r'(<script\b.*?</script>)', t, flags=re.S)
            n = ''.join(x if x.startswith('<script') else wrap(x) for x in parts)
            if count:
                n = n.replace('</head>', '<style>picture{display:contents}</style>\n</head>', 1)
                open(p, 'w', encoding='utf-8').write(n)
                wrapped += count
    print(f'  WebP: файлов {made}, картинок в <picture> {wrapped}')



# ---------------------------------------------------------------------------
# Языковые версии /en/, /zh/, /ar/ (05.10.2026)
#
# Перевод в браузере (shared/i18n.js) поисковики не видят: адрес у страницы один,
# русский. Здесь те же словари применяются при сборке (09_admin/i18n_static.py),
# и переведённая страница получает свой адрес и hreflang-связку с русской.
#
# Версия создаётся только если после перевода русского осталось не больше
# LANG_MAX_CYR видимого текста — полурусская страница хуже, чем никакая.
# Поэтому набор страниц определяется словарём: пополнили словарь — при следующей
# сборке на этом языке появятся новые страницы.
#
# <base href> указывает на папку русского оригинала: картинки, стили, скрипты и
# ссылки на непереведённые страницы ведут туда же, куда у оригинала. Ссылки на
# страницы, у которых есть перевод, переписываются на /<язык>/….
# ---------------------------------------------------------------------------
# Переводы текстов главной, подарков и посадочных лежат в 09_admin/i18n_pages.json: {"русская строка": [en, zh, ar]}.
# Строки с {n}, {price_range}… — шаблоны ответов FAQ и подзаголовков: сборка подставляет в них цифры каталога
# и кладёт в shared/i18n-pages.js уже готовые фразы на всех языках. Поменяли русский текст в landing_copy.json —
# поправьте ключ и перевод в i18n_pages.json, иначе строка останется непереведённой.
PAGE_TR_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'i18n_pages.json')
PAGE_TR = json.load(open(PAGE_TR_SRC, encoding='utf-8')) if os.path.exists(PAGE_TR_SRC) else {}
PAGE_TR_DONE = {}
PRICE_WORDS = {'ru': ('по запросу', 'от {a}', 'от {a} до {b}'), 'en': ('on request', 'from {a}', 'from {a} to {b}'),
               'zh': ('面议', '{a} 起', '{a} 至 {b}'), 'ar': ('عند الطلب', 'من {a}', 'من {a} إلى {b}')}


def price_range(pp, rub, lang='ru'):
    w = PRICE_WORDS[lang]
    if not pp:
        return w[0]
    if len(pp) == 1 or pp[0] == pp[-1]:
        return w[1].format(a=rub(pp[0]))
    return w[2].format(a=rub(pp[0]), b=rub(pp[-1]))


def fmt_tr(tpl, f, pp=None, rub=None):
    """tpl.format(**f) — и та же фраза на en/zh/ar в PAGE_TR_DONE, если шаблон переведён."""
    ru = tpl.format(**f)
    v = PAGE_TR.get(tpl)
    if v and '{' in tpl:
        res = []
        for lang, t in zip(('en', 'zh', 'ar'), v):
            g = dict(f)
            if 'price_range' in f and rub:
                g['price_range'] = price_range(pp, rub, lang)
            res.append(t.format(**g))
        PAGE_TR_DONE[ru] = res
    return ru


def write_page_i18n():
    d = {k: v for k, v in PAGE_TR.items() if '{' not in k}
    d.update(PAGE_TR_DONE)
    open(os.path.join(OUT, 'shared', 'i18n-pages.js'), 'w', encoding='utf-8').write(
        '/* Сгенерировано build_public_site.py из 09_admin/i18n_pages.json — не править руками */\n'
        'window.RELICTUM_I18N_PAGES=' + json.dumps(d, ensure_ascii=False) + ';\n')
    print(f'  переводы страниц: {len(d)} строк')


LANG_MAX_CYR = 0.10
LANG_SKIP = {'404.html', 'object.html', 'objects/exhibit.html', 'eras/index.html', 'account.html', 'cart.html', 'checkout.html'}


def lang_versions():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import i18n_static as I
    try:
        T = I.Translator(I.load_dicts(OUT))
    except Exception as e:
        print('  ! словари i18n не прочитаны — языковые версии не собраны:', e); return []
    src = {}
    for dp, _, fs in os.walk(OUT):
        rel_dp = os.path.relpath(dp, OUT).replace(os.sep, '/')
        if rel_dp.split('/')[0] in I.LANGS or rel_dp.startswith('shared'):
            continue
        for f in fs:
            if not f.endswith('.html'):
                continue
            rel = (f if rel_dp == '.' else rel_dp + '/' + f)
            if rel in LANG_SKIP or rel.startswith(('yandex_', 'google')):
                continue
            t = open(os.path.join(dp, f), encoding='utf-8').read()
            if re.search(r'<meta name="robots" content="[^"]*noindex', t):
                continue
            src[rel] = t
    done = {lang: {} for lang in I.LANGS}
    for lang in I.LANGS:
        for rel, t in src.items():
            o = T.page(t, lang)
            if I.visible_share(o) <= LANG_MAX_CYR:
                done[lang][rel] = o
    url = lambda lang, rel: DOMAIN + '/' + ('' if lang == 'ru' else lang + '/') + ('' if rel == 'index.html' else rel)

    def alternates(rel):
        tags = [f'<link rel="alternate" hreflang="ru" href="{url("ru", rel)}">']
        tags += [f'<link rel="alternate" hreflang="{I.HREFLANG[l]}" href="{url(l, rel)}">' for l in I.LANGS if rel in done[l]]
        tags.append(f'<link rel="alternate" hreflang="x-default" href="{url("ru", rel)}">')
        return '\n'.join(tags) + '\n'

    def meta_tr(t, lang):
        def one(m):
            o = T.tr(html.unescape(m.group(2)), lang)
            return m.group(1) + (html.escape(o, quote=True) if o else m.group(2)) + m.group(3)
        t = re.sub(r'(<title>)(.*?)(</title>)', one, t, count=1, flags=re.S)
        t = re.sub(r'(<meta (?:name="description"|property="og:title"|property="og:description"|name="twitter:title"|name="twitter:description") content=")([^"]*)(")', one, t)
        def ld(m):
            try:
                d = json.loads(m.group(2))
            except Exception:
                return m.group(0)
            def walk(x):
                if isinstance(x, dict):
                    return {k: (T.tr(v, lang) or v) if k in ('name', 'headline', 'description', 'category', 'text') and isinstance(v, str) else walk(v) for k, v in x.items()}
                if isinstance(x, list):
                    return [walk(v) for v in x]
                return x
            d = walk(d)
            if isinstance(d, dict) and d.get('inLanguage') == 'ru':
                d['inLanguage'] = 'zh-Hans' if lang == 'zh' else lang
            return m.group(1) + json.dumps(d, ensure_ascii=False) + m.group(3)
        return re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', ld, t, flags=re.S)

    made = []
    for lang in I.LANGS:
        have = done[lang]
        for rel, t in have.items():
            folder = rel.rsplit('/', 1)[0] + '/' if '/' in rel else ''
            me = url(lang, rel)

            def href(m):
                v = m.group(2)
                if v.startswith('#'):
                    return m.group(1) + me + v + m.group(3)
                if v.startswith(('http', '/', 'mailto:', 'tel:', 'javascript:', 'data:')):
                    return m.group(0)
                path, tail = re.match(r'([^?#]*)(.*)', v).groups()
                tgt = os.path.normpath(folder + path).replace(os.sep, '/') if path else rel
                if tgt.endswith('/') or tgt in ('.', ''):
                    tgt = (tgt.rstrip('/') + '/index.html').lstrip('./') or 'index.html'
                if tgt in have:
                    return m.group(1) + url(lang, tgt) + tail + m.group(3)
                return m.group(0)
            t = re.sub(r'(\shref=")([^"]*)(")', href, t)
            t = meta_tr(t, lang)
            t = re.sub(r'<html lang="[^"]*"', '<html lang="' + ('zh-CN' if lang == 'zh' else lang) + '" data-rl-lang="' + lang + '"'
                       + (' dir="rtl"' if lang == 'ar' else ''), t, count=1)
            t = re.sub(r'<link rel="canonical"[^>]*>\s*', '', t)
            t = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + me + m.group(2), t, count=1)
            t = re.sub(r'(<head[^>]*>)', lambda m: m.group(1) + f'\n<base href="/{folder}">', t, count=1)
            t = t.replace('</head>', f'<link rel="canonical" href="{me}">\n' + alternates(rel) + '</head>', 1)
            out = os.path.join(OUT, lang, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            open(out, 'w', encoding='utf-8').write(t)
            made.append(lang + '/' + rel)
    # русским оригиналам — та же hreflang-связка
    for rel in src:
        if any(rel in done[l] for l in I.LANGS):
            p = os.path.join(OUT, rel)
            t = open(p, encoding='utf-8').read()
            open(p, 'w', encoding='utf-8').write(t.replace('</head>', alternates(rel) + '</head>', 1))
    print('  языковые версии: ' + ', '.join(f'{l} — {len(done[l])}' for l in I.LANGS) + f' (порог русского текста {int(LANG_MAX_CYR * 100)}%)')
    return made


def prune_media():
    haystack = []
    for root, _, files in os.walk(OUT):
        for f in files:
            if f.endswith(('.html', '.js', '.css', '.xml', '.txt')):
                haystack.append(open(os.path.join(root, f), encoding='utf-8',
                                     errors='ignore').read())
    blob = '\n'.join(haystack)

    dropped = []
    for root, _, files in os.walk(OUT):
        rel_dir = os.path.relpath(root, OUT).replace(os.sep, '/')
        if any(rel_dir == k or rel_dir.startswith(k + '/') for k in KEEP_DIRS):
            continue
        for f in files:
            if not f.lower().endswith(MEDIA_EXT):
                continue
            stem = f.rsplit('.', 1)[0]
            # Плитки галереи (tile_<кадр>.jpg) собирает сборщик, а имя им шаблон
            # склеивает уже в браузере — в тексте страниц его нет. Держим плитку,
            # пока жив её исходный кадр.
            if f.startswith('tile_'):
                stem = f[len('tile_'):].rsplit('.', 1)[0]
            # имя целиком или без расширения (в данных картинки задаются как "ph_slug").
            # Хвост проверяем обязательно: голое `stem in blob` считает «ph_cave_lion»
            # использованным из-за «ph_cave_lion2.jpg» — сироты так оставались в срезе.
            if f in blob or re.search(re.escape(stem) + r'(?![0-9A-Za-z_])', blob):
                continue
            p = os.path.join(root, f)
            dropped.append((os.path.relpath(p, OUT), os.path.getsize(p)))
            os.remove(p)
    return dropped


METRIKA_ID = 112582573   # счётчик «Relictum», создан владельцем 21.09.2026 (под другим логином; alex@stargift.ru нужен доступ для целей)
METRIKA = """<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=%(id)d', 'ym');
    window.RELICTUM_YM = %(id)d;
    ym(%(id)d, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
    /* цели: клик по телефону и WhatsApp; заявка/заказ/корзина отправляются из shared/shop.js */
    document.addEventListener('click', function(e){
        var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"], a[href*="wa.me"], a[href*="whatsapp"]') : null;
        if (!a) return;
        try { ym(%(id)d, 'reachGoal', /^tel:/.test(a.getAttribute('href')) ? 'phone_click' : 'whatsapp_click'); } catch (err) {}
    }, true);
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/%(id)d" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->
""" % {'id': METRIKA_ID or 0}


def inject_metrika():
    """Счётчик на каждую HTML-страницу среза (и в шаблон визиток — узел публикации рендерит из него)."""
    if not METRIKA_ID:
        print('  метрика: счётчика нет, код не ставим'); return
    n = 0
    for root, _, files in os.walk(OUT):
        for f in files:
            if not f.endswith('.html'):
                continue
            p = os.path.join(root, f)
            t = open(p, encoding='utf-8').read()
            if 'mc.yandex.ru/metrika' in t or '</head>' not in t:
                continue
            open(p, 'w', encoding='utf-8').write(t.replace('</head>', METRIKA + '</head>', 1)); n += 1
    print(f'  метрика: {n} страниц')


def write_extras(pages):
    today = date.today().isoformat()

    # служебные страницы в поиске не нужны
    PRIVATE = {'cart.html', 'checkout.html', 'account.html', '404.html'}

    urls = []
    for p in pages:
        # exhibit.html и object.html — шаблоны, живут только с ?id=
        if p.startswith('objects/exhibit.html') or p == 'object.html' or p in PRIVATE:
            continue
        urls.append(public_url(p))
    # витрина и каталог — главнее прочего
    def weight(u):
        if u == DOMAIN + '/':
            return '1.0'
        if u.endswith('/catalog.html'):
            return '0.9'
        return '0.7'
    body = '\n'.join(
        f'  <url><loc>{u}</loc><lastmod>{today}</lastmod><priority>{weight(u)}</priority></url>'
        for u in sorted(set(urls)))
    open(os.path.join(OUT, 'sitemap.xml'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n')

    # llms.txt — карта сайта для нейропоиска: кто мы, разделы, лоты с описаниями
    lots = [pg for pg in object_pages() if not pg.get('noindex')]
    llms = ['# RELICTUM', '',
            '> RELICTUM — московский дом редких природных артефактов: скелеты и черепа динозавров, метеориты, '
            'аммониты, минералы, мамонтовая фауна. Каждый объект с паспортом происхождения. Галерея в ТЦ «Гименей», '
            'Москва, ул. Большая Якиманка, 22, ежедневно 10:00–22:00, +7 495 233 5111.', '',
            '## Разделы', f'- [Каталог]({DOMAIN}/catalog.html): все объекты с ценами и паспортами',
            f'- [Эпохи]({DOMAIN}/eras/eras.html): страницы геологических периодов',
            f'- [Интерьеры]({DOMAIN}/interiors.html): размещение объектов в доме и офисе',
            f'- [Журнал]({DOMAIN}/journal.html): статьи о палеонтологии и метеоритах',
            f'- [Пресса]({DOMAIN}/press.html): публикации о доме',
            f'- [Галерея]({DOMAIN}/maison.html): адрес и часы работы',
            f'- [Частые вопросы]({DOMAIN}/faq.html): подлинность, паспорт экспоната, цены, оплата, доставка, возврат', '',
            '## Объекты коллекции']
    llms += [f'- [{pg["title"].replace(" — RELICTUM", "")}]({pg["url"]}): {pg["description"]}' for pg in lots]
    open(os.path.join(OUT, 'llms.txt'), 'w', encoding='utf-8').write('\n'.join(llms) + '\n')

    open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf-8').write(
        'User-agent: *\n'
        'Allow: /\n'
        + ''.join(f'Disallow: /{p}\n' for p in sorted(PRIVATE - {'404.html'})) +
        f'Sitemap: {DOMAIN}/sitemap.xml\n')

    htaccess = HTACCESS
    if not FORCE_HTTPS:
        # без сертификата любой уход на https = недоступный сайт
        htaccess = htaccess.replace(
            'RewriteCond %{REQUEST_URI} !^/\.well-known/\nRewriteCond %{HTTPS} !=on\nRewriteRule ^(.*)$ https://relictum.gallery/$1 [R=301,L]',
            '# редирект на https выключен: сертификат ещё не выпущен (FORCE_HTTPS в build_public_site.py)')
        htaccess = htaccess.replace('RewriteRule ^(.*)$ https://%1/$1 [R=301,L]',
                                    'RewriteRule ^(.*)$ http://%1/$1 [R=301,L]')
    open(os.path.join(OUT, '.htaccess'), 'w', encoding='utf-8').write(htaccess)
    open(os.path.join(OUT, 'cors.php'), 'w', encoding='utf-8').write(CORS_PHP)
    open(os.path.join(OUT, 'send.php'), 'w', encoding='utf-8').write(SEND_PHP)
    # узел публикации из CRM StarGift: ключ берём с сервера при сборке, в git он не попадает
    key = node_key()
    if key:
        open(os.path.join(OUT, 'relictum-node.php'), 'w', encoding='utf-8').write(NODE_PHP.replace('__NODE_KEY__', key))
        print('   relictum-node.php: собран с ключом')
    else:
        print('   ⚠ relictum-node.php НЕ собран: ключ RELICTUM_NODE_KEY не получен с сервера')
    open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(PAGE_404)


CORS_PHP = r"""<?php
/* Отдача медиа с CORS-заголовками: /cors/<путь> -> этот файл.
   Только чтение файлов внутри веб-корня, только медиа-расширения. */
$f = isset($_GET['f']) ? $_GET['f'] : '';
if ($f === '' || strpos($f, '..') !== false || $f[0] === '/') { http_response_code(400); exit; }
$root = __DIR__;
$path = realpath($root . '/' . $f);
if ($path === false || strpos($path, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) { http_response_code(404); exit; }
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$types = array('jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp','gif'=>'image/gif',
               'svg'=>'image/svg+xml','mp4'=>'video/mp4','webm'=>'video/webm','css'=>'text/css','js'=>'application/javascript',
               'woff'=>'font/woff','woff2'=>'font/woff2');
if (!isset($types[$ext])) { http_response_code(403); exit; }
header('Content-Type: ' . $types[$ext]);
header('Content-Length: ' . filesize($path));
header('Access-Control-Allow-Origin: *');
header('Timing-Allow-Origin: *');
header('Cache-Control: max-age=2592000');
readfile($path);
"""


SEND_PHP = r"""<?php
/* Приём заявок и заказов с сайта -> письмо в дом.
   До этого формы писали только в localStorage посетителя, и до дома
   ничего не доходило. Адрес получателя зашит: открытого релея тут нет. */
$TO   = 'info@stargift.ru';
$FROM = 'noreply@relictum.gallery';

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"ok":false}'; exit; }

$raw = file_get_contents('php://input', false, null, 0, 64 * 1024);
$in  = json_decode($raw, true);
if (!is_array($in) || empty($in['kind'])) { http_response_code(400); echo '{"ok":false}'; exit; }

/* Простой тормоз против спама: не чаще одного письма в 20 секунд с адреса. */
$stamp = sys_get_temp_dir() . '/relictum_send_' . md5($_SERVER['REMOTE_ADDR']);
if (file_exists($stamp) && time() - filemtime($stamp) < 20) { http_response_code(429); echo '{"ok":false}'; exit; }
touch($stamp);

function clean($s) { return trim(str_replace(array("\r", "\n"), ' ', (string)$s)); }

$kind = clean($in['kind']);
$data = isset($in['data']) && is_array($in['data']) ? $in['data'] : array();

/* Служебное в письмо не пишем: дом читает заявку, а не дамп формы. */
$SKIP   = array('date','type','consent','items','total','contact','page','payment',
                'lot_id','lot_name','lot_price','lot_url','lot_photo');
$LABELS = array('name'=>'Имя','phone'=>'Телефон','email'=>'Почта','desc'=>'Запрос','about'=>'Объект',
                'note'=>'Комментарий','addr'=>'Доставка','era'=>'Эпоха','budget'=>'Бюджет','room'=>'Помещение','style'=>'Стиль интерьера','space'=>'Сколько места','kind'=>'Тип экспоната');
$lines = array();
foreach ($data as $k => $v) {
    if (in_array($k, $SKIP, true) || $v === '' || $v === null) { continue; }
    $k = isset($LABELS[$k]) ? $LABELS[$k] : $k;
    if (is_array($v)) {
        $parts = array();
        foreach ($v as $it) {
            if (is_array($it)) {
                $name = isset($it['name']) ? $it['name'] : '';
                $qty  = isset($it['qty']) ? $it['qty'] : '';
                $price = isset($it['price']) ? $it['price'] : '';
                $parts[] = trim($name . ' ' . ($qty ? ('x' . $qty) : '') . ' ' . $price);
            } else { $parts[] = (string)$it; }
        }
        $v = implode('; ', $parts);
    }
    $lines[] = clean($k) . ': ' . clean($v);
}

$body  = "Заявка с сайта relictum.gallery — " . $kind . "\n\n";
$body .= implode("\n", $lines) . "\n";
if (!empty($data['items']) && is_array($data['items'])) {
    $body .= "\nОбъекты:\n";
    foreach ($data['items'] as $it) {
        if (is_array($it)) {
            $body .= '— ' . (isset($it['title']) ? $it['title'] : '') .
                     (isset($it['price']) && $it['price'] ? ', ' . number_format($it['price'], 0, '', ' ') . ' руб.' : '') .
                     (isset($it['url']) ? "\n  " . $it['url'] : '') . "\n";
        } else { $body .= '— ' . $it . "\n"; }
    }
    if (!empty($data['total'])) { $body .= "\nИтого: " . number_format($data['total'], 0, '', ' ') . " руб.\n"; }
}

$subject = '=?UTF-8?B?' . base64_encode('RELICTUM — ' . $kind) . '?=';
$headers  = "From: RELICTUM <$FROM>\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "MIME-Version: 1.0\r\n";

/* Ответить посетителю можно прямо из письма, если он оставил e-mail. */
foreach (array('email', 'contact') as $key) {
    if (!empty($data[$key]) && filter_var($data[$key], FILTER_VALIDATE_EMAIL)) {
        $headers .= 'Reply-To: ' . clean($data[$key]) . "\r\n";
        break;
    }
}

/* 1. Основной канал — приёмник StarGift: он кладёт заявку в crm_requests
      и сам шлёт письмо. Ходим сервер-к-серверу с ключом бота: CORS и CSRF
      этого пути не касаются. Ключ лежит в конфиге StarGift на том же
      аккаунте — сюда не копируется и в репозиторий не попадает. */
$crm = false;
/* Ключ лежит отдельным файлом ВНЕ веб-корня (~/relictum.gallery/.sg-key, chmod 600):
   конфиг StarGift этому сайту не читается — процессы сайтов изолированы по правам,
   а в репозиторий секрет попасть не должен. */
$keyFile = __DIR__ . '/../.sg-key';
/* Согласие формы шлют внутри data (S.send передаёт запись формы целиком);
   верхний уровень оставлен для совместимости. Без учёта data['consent']
   ворота в CRM не открывались ни одной заявке — всё падало в запасную почту. */
if ((!empty($in['consent']) || !empty($data['consent'])) && is_readable($keyFile)) {
    $key = trim((string)@file_get_contents($keyFile));
    $phone = '';
    foreach (array('phone', 'contact') as $k) {
        if (!empty($data[$k]) && strlen(preg_replace('/\D/', '', $data[$k])) >= 11) { $phone = $data[$k]; break; }
    }
    if ($key !== '' && $phone !== '') {
        /* Всё уходит одним типом 'relictum' и ложится в таблицу questions —
           туда же, куда лиды с форм stargift.ru, и попадает в счётчик новых
           заявок CRM. Ветку 'order' не используем: она завязана на позиции
           каталога StarGift с их id, а каталог Relictum свой — заказ бы
           отклонился или лёг с чужими позициями. Состав заказа уходит текстом
           в message. */
        /* Если в заявке есть позиции в схеме приёмника — отправляем её как
           заказ: только для 'order' он собирает письмо вёрсткой, с фотографией
           и ссылкой на объект. Всё прочее уходит типом 'relictum' и ложится в
           общий список заявок. */
        /* Запрос конкретного лота: собираем позицию, чтобы в CRM были
           фото, ссылка и цена, а не одна строка текста. */
        if (empty($data['items']) && !empty($data['lot_id'])) {
            $lotPrice = 0;
            if (!empty($data['lot_price'])) {
                $digits = preg_replace('/[^0-9]/u', '', $data['lot_price']);
                $lotPrice = $digits === '' ? 0 : (int)$digits;
            }
            $data['items'] = array(array(
                'id'       => clean($data['lot_id']),
                'title'    => clean(isset($data['lot_name']) ? $data['lot_name'] : ''),
                'price'    => $lotPrice,
                'quantity' => 1,
                'url'      => clean(isset($data['lot_url']) ? $data['lot_url'] : ''),
                'photo'    => clean(isset($data['lot_photo']) ? $data['lot_photo'] : ''),
            ));
            $lines[] = 'Ссылка: ' . clean($data['lot_url']);
            if (!empty($data['lot_price'])) { $lines[] = 'Цена: ' . clean($data['lot_price']); }
        }
        $rich = (!empty($data['items']) && is_array($data['items']) && !empty($data['items'][0]['title']));
        $payload = array(
            'form_type' => (!empty($data['lot_id']) ? 'relictum' : ($rich ? 'order' : 'relictum')),
            'name'      => isset($data['name']) ? clean($data['name']) : 'Гость Relictum',
            'phone'     => $phone,
            'email'     => isset($data['email']) ? clean($data['email']) : '',
            'message'   => ($rich ? '' : "Заявка с сайта relictum.gallery — $kind\n\n")
                           . implode("\n", $lines),
            'consent'   => true,
        );
        if ($rich || !empty($data['lot_id'])) {
            $payload['items']   = $data['items'];
            $payload['total']   = isset($data['total']) ? $data['total'] : 0;
            $payload['payment'] = isset($data['payment']) ? clean($data['payment']) : 'по счёту';
        }

        $ch = curl_init('https://stargift.ru/api/send-form.php');
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'X-Bot-Key: ' . $key),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
        ));
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $crm = ($code === 200 && strpos((string)$resp, '"success":true') !== false);
    }
}

/* 2. Запасной канал — письмо своими силами. Шлём, только если в CRM не легло:
      иначе дом получит два письма на одну заявку. */
$mailed = false;
if (!$crm) { $mailed = @mail($TO, $subject, $body, $headers); }

echo json_encode(array('ok' => ($crm || $mailed), 'crm' => $crm, 'mail' => $mailed));
"""

RESOLVE_PHP = r"""<?php
/* Резолвер «кривых» ссылок на визитки (30.09.2026): /objects/0262, /objects/0262-Septaria.html,
   /objects/0262-septaria.html— и т.п. По номеру лота ищем визитку и уводим на неё 301-м. PHP 5.6. */
$p = isset($_GET['p']) ? (string)$_GET['p'] : '';
$p = rawurldecode($p);
if (preg_match('/(\d{4})/', $p, $m)) {
    $hits = glob(__DIR__ . '/' . $m[1] . '-*.html');
    if ($hits && count($hits) === 1) {
        header('Location: https://relictum.gallery/objects/' . basename($hits[0]), true, 301); exit;
    }
    $lc = strtolower(preg_replace('/\.html.*$/i', '', $p));
    foreach ((array)$hits as $h) { if (strtolower(basename($h, '.html')) === basename($lc)) { header('Location: https://relictum.gallery/objects/' . basename($h), true, 301); exit; } }
    if ($hits) { header('Location: https://relictum.gallery/objects/' . basename($hits[0]), true, 301); exit; }
}
header('HTTP/1.1 404 Not Found');
$f = dirname(__DIR__) . '/404.html';
if (is_file($f)) readfile($f); else echo 'Not found';
"""

HTACCESS = r"""# RELICTUM — relictum.gallery
RewriteEngine On

# только https и без www.
# ВАЖНО: /.well-known/ исключён — по нему Let's Encrypt проверяет домен по http,
# и редирект на https сломал бы выпуск и продление сертификата.
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://relictum.gallery/$1 [R=301,L]
RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [R=301,L]

# главная одна — «/»; /index.html (и /eras/index.html и т.п.) уводим на папку.
# THE_REQUEST — чтобы не зациклить внутреннюю отдачу index.html для «/».
RewriteCond %{THE_REQUEST} \s/((?:[^\s?]*/)?)index\.html[\s?]
RewriteRule ^ https://relictum.gallery/%1 [R=301,L]

# Ссылка на лот в мессенджере: /objects/exhibit.html?id=<slug> внутренне отдаёт
# визитку /objects/<slug>.html — тот же шаблон, но с фото и описанием лота в
# OG-тегах (мессенджеры не выполняют JS и читают только статичную разметку).
# Если визитки нет, условие -f не срабатывает и отдаётся обычный exhibit.html.
# страница deep-time скрыта — старые ссылки уводим на «Эры»
RedirectMatch 302 ^/eras/deep-time\.html$ https://relictum.gallery/eras/eras.html
# переименованные лоты (старые адреса из QR/ссылок ведут на новые визитки)
RedirectMatch 301 ^/objects/0638-seymchan-olivine-dense\.html$ https://relictum.gallery/objects/0638-maslyanino-iron.html
RewriteCond %{QUERY_STRING} ^id=0638-seymchan-olivine-dense$
RewriteRule ^objects/exhibit\.html$ https://relictum.gallery/objects/0638-maslyanino-iron.html? [R=301,L]

RewriteCond %{QUERY_STRING} (?:^|&)id=([0-9A-Za-z_-]+)
RewriteCond %{DOCUMENT_ROOT}/objects/%1.html -f
RewriteRule ^objects/exhibit\.html$ /objects/%1.html [L]

# Терпимые адреса визиток (30.09.2026): без .html, с хвостом после .html,
# слаг без папки objects/, только номер лота — всё уводим на правильный адрес.
RewriteCond %{DOCUMENT_ROOT}/objects/$1.html -f
RewriteRule ^objects/([0-9a-z-]+)/?$ https://relictum.gallery/objects/$1.html [R=301,L]
RewriteCond %{DOCUMENT_ROOT}/objects/$1.html -f
RewriteRule ^objects/([0-9a-z-]+)\.html.+$ https://relictum.gallery/objects/$1.html [R=301,L]
RewriteCond %{DOCUMENT_ROOT}/objects/$1.html -f
RewriteRule ^([0-9]{4}-[0-9a-z-]+)(?:\.html)?/?$ https://relictum.gallery/objects/$1.html [R=301,L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^objects/(.+)$ /objects/_resolve.php?p=$1 [L,QSA]

# /cors/<путь-к-файлу> — те же медиа, но с CORS-заголовками. Нужен браузерным
# инструментам (Claude Design и пр.): статику Beget раздаёт nginx-ом, который
# игнорирует Header-директивы, а PHP проходит через Apache — там заголовки наши.
RewriteRule ^cors/(.+)$ cors.php?f=$1 [L,QSA]

ErrorDocument 404 /404.html

# CORS для медиа: без Access-Control-Allow-Origin браузерные инструменты
# (Claude Design, Figma-плагины, canvas-редакторы) не могут загрузить картинку
# с сайта — fetch блокируется политикой same-origin. Отдаём медиа всем: файлы
# публичные, ничего приватного тут нет.
<IfModule mod_headers.c>
  <FilesMatch "\.(jpe?g|png|webp|gif|svg|mp4|webm|woff2?|css|js)$">
    Header set Access-Control-Allow-Origin "*"
    Header set Timing-Allow-Origin "*"
  </FilesMatch>
</IfModule>

# сжатие текста
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/javascript application/json image/svg+xml
</IfModule>

# кэш: медиа надолго (имена версионируются через ?v=N), разметка — коротко
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/webp "access plus 30 days"
  ExpiresByType video/mp4 "access plus 30 days"
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType text/html "access plus 10 minutes"
</IfModule>

# Шрифты дома лежат у нас же. ForceType, а не AddType: сервер по умолчанию
# отдаёт .woff2 как application/font-woff2 (устаревший тип), из-за чего правило
# ExpiresByType font/woff2 не срабатывало и кэш был 30 дней вместо года.
<IfModule mod_mime.c>
  AddType font/woff2 .woff2
</IfModule>
<FilesMatch "\.woff2$">
  ForceType font/woff2
  Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>

# Служебные заголовки. Сайт статический, форм с деньгами нет, поэтому набор
# минимальный и безопасный: запрет угадывать тип файла, запрет показывать сайт
# внутри чужого фрейма и обрезка реферера до домена.
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Content-Security-Policy "frame-ancestors 'self'"
  Header set Permissions-Policy "geolocation=(), microphone=(), camera=()"
</IfModule>
"""

PAGE_404 = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Страница не найдена — RELICTUM</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/style.css">
<link rel="icon" type="image/png" sizes="32x32" href="/shared/brand/favicon-32.png">
<link rel="icon" href="/shared/brand/favicon.ico">
<style>
  .nf{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      text-align:center;padding:120px 24px 80px}
  .nf h1{font-family:var(--serif,'Cormorant Garamond',serif);font-size:clamp(38px,6vw,68px);
      font-weight:300;margin:0 0 18px}
  .nf p{max-width:520px;margin:0 0 34px;line-height:1.7;opacity:.75}
  .nf a{display:inline-block;border:1px solid currentColor;padding:14px 30px;
      text-decoration:none;letter-spacing:.14em;text-transform:uppercase;font-size:12px}
</style>
</head>
<body>
<div class="nf">
  <h1>Такой страницы нет</h1>
  <p>Адрес мог измениться, а объект — уйти в частное собрание. Коллекция целиком открыта в каталоге.</p>
  <a href="/catalog.html">Смотреть каталог</a>
</div>
</body>
</html>
"""


def node_key():
    """RELICTUM_NODE_KEY из ~/stargift.ru/.env на сервере (или из окружения)."""
    if os.environ.get('RELICTUM_NODE_KEY'):
        return os.environ['RELICTUM_NODE_KEY'].strip()
    try:
        out = subprocess.run(['ssh', '-i', os.path.expanduser('~/.ssh/id_ed25519'), 'stargift@stargift.beget.tech',
                              "grep -E '^RELICTUM_NODE_KEY=' ~/stargift.ru/.env | cut -d= -f2-"],
                             capture_output=True, text=True, timeout=30).stdout.strip().strip('"\'')
        return out or None
    except Exception:
        return None


# Узел на relictum.gallery: принимает от CRM StarGift (сервер-к-серверу) готовые данные
# и файлы и пишет их в свой веб-корень — у PHP этого сайта есть права на свои файлы,
# у PHP stargift.ru — нет (изоляция сайтов на Beget через ACL).
NODE_PHP = r"""<?php
/* relictum-node.php — генерируется билдером, руками не править. PHP 5.6-совместимый.
   POST JSON, заголовок X-Node-Key. action: ping | write_data | write_image */
header('Content-Type: application/json; charset=utf-8');
define('NODE_KEY', '__NODE_KEY__');
$key = isset($_SERVER['HTTP_X_NODE_KEY']) ? $_SERVER['HTTP_X_NODE_KEY'] : '';
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || NODE_KEY === '' || !hash_equals(NODE_KEY, $key)) { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) { http_response_code(400); echo '{"error":"bad_json"}'; exit; }
$root = dirname(__FILE__);
function node_out($d, $code = 200) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function node_atomic($path, $content) {
    $tmp = $path . '.tmp-' . getmypid();
    if (file_put_contents($tmp, $content) === false) node_out(array('error' => 'write_failed', 'path' => basename($path)), 500);
    if (!rename($tmp, $path)) { @unlink($tmp); node_out(array('error' => 'rename_failed', 'path' => basename($path)), 500); }
    @chmod($path, 0644);
}
$action = isset($body['action']) ? $body['action'] : '';
if ($action === 'ping') {
    node_out(array('ok' => true, 'writable' => is_writable($root . '/shared') && is_writable($root . '/objects'),
                   'php' => PHP_VERSION, 'user' => get_current_user()));
}
function node_meta($t, $pattern, $value) { return preg_replace($pattern, '${1}' . str_replace(array('\\', '$'), array('\\\\', '\$'), $value) . '${2}', $t, 1); }
function node_render_page($t, $pg) {
    $h = function ($v) { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); };
    $title = $h($pg['title']); $desc = $h($pg['description']); $img = $h($pg['image']); $url = $h($pg['url']);
    $t = preg_replace('/<title>.*?<\/title>/s', '<title>' . $title . '</title>', $t, 1);
    $t = node_meta($t, '/(<meta name="description" content=")[^"]*(")/', $desc);
    $t = node_meta($t, '/(<meta property="og:title" content=")[^"]*(")/', $title);
    $t = node_meta($t, '/(<meta property="og:description" content=")[^"]*(")/', $desc);
    $t = node_meta($t, '/(<meta property="og:type" content=")[^"]*(")/', 'product');
    $t = node_meta($t, '/(<meta property="og:image" content=")[^"]*(")/', $img);
    $t = node_meta($t, '/(<meta property="og:url" content=")[^"]*(")/', $url);
    $t = node_meta($t, '/(<link rel="canonical" href=")[^"]*(")/', $url);
    $t = node_meta($t, '/(<meta name="twitter:title" content=")[^"]*(")/', $title);
    $t = node_meta($t, '/(<meta name="twitter:description" content=")[^"]*(")/', $desc);
    $t = node_meta($t, '/(<meta name="twitter:image" content=")[^"]*(")/', $img);
    $head = '<script>window.RL_FORCE_ID=' . json_encode((string)$pg['id']) . ';</script>' . "\n" . (isset($pg['jsonld']) ? $pg['jsonld'] . "\n" : '')
          . (!empty($pg['noindex']) ? '<meta name="robots" content="noindex,follow">' . "\n" : '');
    $t = str_replace('</head>', $head . '</head>', $t);
    if (isset($pg['ssr'])) $t = preg_replace('/<main id="app">.*?<\/main>/s', '<main id="app">' . str_replace(array('\\', '$'), array('\\\\', '\$'), $pg['ssr']) . '</main>', $t, 1);
    return $t;
}
if ($action === 'write_data') {
    $catalog = isset($body['catalog_js']) ? $body['catalog_js'] : ''; $promo = isset($body['promo_js']) ? $body['promo_js'] : '';
    if (strpos($catalog, 'window.RELICTUM_CATALOG') === false || strpos($promo, 'window.RELICTUM_PROMO') === false) node_out(array('error' => 'bad_payload'), 400);
    $bak = $root . '/shared/_data-backups'; if (!is_dir($bak)) @mkdir($bak, 0755, true);
    $stamp = date('Ymd-His');
    @copy($root . '/shared/catalog.js', "$bak/catalog-$stamp.js"); @copy($root . '/objects/promo-data.js', "$bak/promo-data-$stamp.js");
    $baks = glob("$bak/catalog-*.js"); if (!$baks) $baks = array(); sort($baks);
    $extra = count($baks) - 5;
    if ($extra > 0) foreach (array_slice($baks, 0, $extra) as $b) { @unlink($b); @unlink(str_replace('catalog-', 'promo-data-', $b)); }
    node_atomic($root . '/shared/catalog.js', $catalog); node_atomic($root . '/objects/promo-data.js', $promo);
    /* визитки лотов /objects/<slug>.html — из шаблона exhibit.html и данных, которые прислала CRM
       (title, description, og-картинка, статичный HTML для роботов, JSON-LD, noindex для скрытых) */
    $pagesWritten = 0;
    if (!empty($body['pages']) && is_array($body['pages'])) {
        $tpl = @file_get_contents($root . '/objects/exhibit.html');
        if ($tpl) {
            $visible = array();
            foreach ($body['pages'] as $pg) {
                $slug = isset($pg['slug']) ? (string)$pg['slug'] : '';
                if (!preg_match('/^[a-z0-9-]+$/', $slug)) continue;
                $page = node_render_page($tpl, $pg);
                /* 06.10.2026: hreflang-связка с языковыми версиями визитки, если сборка их выложила
                   (/en|zh|ar/objects/<slug>.html) — иначе каждая публикация рвала обратные ссылки ru↔en */
                $alt = '';
                foreach (array('en' => 'en', 'zh' => 'zh-Hans', 'ar' => 'ar') as $lg => $hl) {
                    if (is_file($root . '/' . $lg . '/objects/' . $slug . '.html'))
                        $alt .= '<link rel="alternate" hreflang="' . $hl . '" href="https://relictum.gallery/' . $lg . '/objects/' . $slug . '.html">' . "\n";
                }
                if ($alt !== '') {
                    $ru = 'https://relictum.gallery/objects/' . $slug . '.html';
                    $alt = '<link rel="alternate" hreflang="ru" href="' . $ru . '">' . "\n" . $alt . '<link rel="alternate" hreflang="x-default" href="' . $ru . '">' . "\n";
                    $page = str_replace('</head>', $alt . '</head>', $page);
                }
                node_atomic($root . '/objects/' . $slug . '.html', $page); $pagesWritten++;
                if (empty($pg['noindex'])) $visible[] = 'https://relictum.gallery/objects/' . $slug . '.html';
            }
            $sm = @file_get_contents($root . '/sitemap.xml');
            if ($sm && preg_match_all('/<url>.*?<\/url>/s', $sm, $mm)) {
                $keep = array();
                /* русские визитки пересобираются ниже; языковые /en|zh|ar/objects/ — от сборки сайта, их сохраняем */
                foreach ($mm[0] as $u) if (strpos($u, '/objects/') === false || preg_match('#\.gallery/(en|zh|ar)/objects/#', $u)) $keep[] = '  ' . trim($u);
                $today = date('Y-m-d');
                foreach ($visible as $u) $keep[] = '  <url><loc>' . $u . '</loc><lastmod>' . $today . '</lastmod><priority>0.7</priority></url>';
                node_atomic($root . '/sitemap.xml', "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" . implode("\n", $keep) . "\n</urlset>\n");
            }
        }
    }
    /* товарные фиды для рекламы — из той же публикации */
    if (!empty($body['feeds']) && is_array($body['feeds'])) {
        if (!is_dir($root . '/feed')) @mkdir($root . '/feed', 0755, true);
        if (!empty($body['feeds']['yml'])) node_atomic($root . '/feed/relictum.yml', $body['feeds']['yml']);
        if (!empty($body['feeds']['csv'])) node_atomic($root . '/feed/relictum.csv', $body['feeds']['csv']);
    }
    $ch = substr(md5($catalog), 0, 8); $ph = substr(md5($promo), 0, 8); $updated = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->getExtension() !== 'html') continue;
        $p = $f->getPathname(); if (strpos($p, '/_data-backups/') !== false) continue;
        $t = file_get_contents($p); $cnt = 0;
        $n = preg_replace(array('/catalog\.js\?v=[a-f0-9]{8}/', '/promo-data\.js\?v=[a-f0-9]{8}/'), array('catalog.js?v=' . $ch, 'promo-data.js?v=' . $ph), $t, -1, $cnt);
        if ($cnt > 0 && $n !== $t) { node_atomic($p, $n); $updated++; }
    }
    node_out(array('ok' => true, 'catalog_hash' => $ch, 'promo_hash' => $ph, 'html_updated' => $updated, 'pages_written' => $pagesWritten));
}
if ($action === 'write_image') {
    $name = basename(isset($body['name']) ? (string)$body['name'] : '');
    if (!preg_match('/^[a-z0-9_.-]+\.(jpg|jpeg|png|webp|mp4)$/i', $name)) node_out(array('error' => 'bad_name'), 400);
    $data = base64_decode(isset($body['data']) ? (string)$body['data'] : '', true);
    if ($data === false || strlen($data) < 100) node_out(array('error' => 'bad_data'), 400);
    $dir = $root . '/shared/img'; if (!is_dir($dir)) @mkdir($dir, 0755, true);
    node_atomic($dir . '/' . $name, $data);
    node_out(array('ok' => true, 'name' => $name, 'bytes' => strlen($data), 'url' => 'https://relictum.gallery/shared/img/' . $name));
}
node_out(array('error' => 'unknown_action'), 400);
"""


if __name__ == '__main__':
    pages, stamp, dropped = build()
    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(OUT) for f in fs)
    if dropped:
        saved = sum(s for _, s in dropped)
        print(f'Не вошло в срез (нет ссылок): {len(dropped)} файлов, {saved/1024/1024:.1f} МБ')
        for name, size in sorted(dropped, key=lambda x: -x[1])[:8]:
            print(f'   {size/1024/1024:6.2f} МБ  {name}')
    print(f'OK · страниц {len(pages)} · вес {total/1024/1024:.0f} МБ · данные ?v={stamp} · → {OUT}')
