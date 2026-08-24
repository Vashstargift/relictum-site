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
def html_and_js(f): return f.endswith('.html') or f.endswith('.js')
def showcase(f): return f.endswith('.html') or f.endswith('.css')

COPY = [
    ('02_site_v1_gallery', '', showcase),
    ('16_product_promos', 'objects', html_and_js),
    # Раздел эр скрыт с сайта (решение владельца 24.08.2026): 15_concepts в срез
    # не кладём, а /eras/ на сервере закрывает редирект (см. hide_eras ниже) —
    # rsync идёт без --delete, старые файлы сами не исчезнут.
    # Вернуть раздел: раскомментировать строку и убрать hide_eras().
    # ('15_concepts', 'eras', html_only),
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
              '02_site_v1_gallery/style.css']


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
    """{slug: (R–ID, title, description, og_image)} — из promo-data.js и catalog.js."""
    promo = open(os.path.join(ROOT, '16_product_promos', 'promo-data.js'), encoding='utf-8').read()
    catalog = open(os.path.join(ROOT, 'shared', 'catalog.js'), encoding='utf-8').read()

    # slug и картинка объекта — из каталога
    meta = {}
    for m in re.finditer(r'"id":\s*"(R–\d+)"(.*?)(?=\n\s*\{|\Z)', catalog, re.S):
        rid, body = m.group(1), m.group(2)
        href = re.search(r'"href":\s*"([^"]*)"', body)
        img = re.search(r'"img":\s*"([^"]*)"', body)
        meta[rid] = (href.group(1) if href else '', img.group(1) if img else '')

    pages = {}
    for m in re.finditer(r'"(R–\d+)"\s*:\s*\{(.*?)\n  \}', promo, re.S):
        rid, body = m.group(1), m.group(2)
        seo = re.search(r'seo:\s*\{\s*title:\s*"((?:[^"\\]|\\.)*)"\s*,\s*description:\s*"((?:[^"\\]|\\.)*)"\s*\}', body)
        if not seo:
            continue
        href, img = meta.get(rid, ('', ''))
        slug = href.rsplit('/', 1)[-1]
        if not slug.endswith('.html'):
            continue
        pages[slug] = (rid, seo.group(1), seo.group(2), img)
    return pages


def write_object_pages(template_text, out_dir, stamp):
    made = []
    for slug, (rid, title, desc, img) in sorted(object_pages().items()):
        rel = 'objects/' + slug
        url = DOMAIN + '/' + rel
        t = template_text

        def one(pattern, value):
            nonlocal t
            t = re.sub(pattern, lambda m: m.group(1) + value + m.group(2), t, count=1)

        t = re.sub(r'<title>.*?</title>', '<title>' + title + '</title>', t, count=1, flags=re.S)
        one(r'(<meta name="description" content=")[^"]*(")', desc)
        one(r'(<meta property="og:title" content=")[^"]*(")', title)
        one(r'(<meta property="og:description" content=")[^"]*(")', desc)
        one(r'(<meta property="og:type" content=")[^"]*(")', 'product')
        one(r'(<meta property="og:image" content=")[^"]*(")', DOMAIN + '/shared/img/' + img + '.jpg')
        one(r'(<meta property="og:url" content=")[^"]*(")', url)
        one(r'(<link rel="canonical" href=")[^"]*(")', url)
        one(r'(<meta name="twitter:title" content=")[^"]*(")', title)
        one(r'(<meta name="twitter:description" content=")[^"]*(")', desc)
        one(r'(<meta name="twitter:image" content=")[^"]*(")', DOMAIN + '/shared/img/' + img + '.jpg')

        # шаблон берёт объект из ?id=, странице-визитке он задан жёстко
        t = t.replace('</head>', '<script>window.RL_FORCE_ID="' + rid + '";</script>\n</head>', 1)

        open(os.path.join(out_dir, slug), 'w', encoding='utf-8').write(t)
        made.append(rel)
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
            if not os.path.isfile(os.path.join(s, f)) or not keep(f):
                continue
            rel = os.path.join(dst_dir, f) if dst_dir else f
            text = open(os.path.join(s, f), encoding='utf-8').read()
            text = rewrite_links(text, dst_dir)
            if f.endswith('.html'):
                text = fix_meta(text, rel)
                text = stamp_scripts(text, stamp)
                pages.append(rel.replace(os.sep, '/'))
            open(os.path.join(d, f), 'w', encoding='utf-8').write(text)

    # страницы-визитки экспонатов собираются из exhibit.html (см. object_pages)
    tpl_path = os.path.join(OUT, 'objects', 'exhibit.html')
    tpl = open(tpl_path, encoding='utf-8').read()
    pages += write_object_pages(tpl, os.path.join(OUT, 'objects'), stamp)

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
    write_focus_map()
    dropped = prune_media()
    stamp_media(OUT)   # ?v=<хэш файла> у картинок и видео — иначе кэш держит старое
    write_extras(pages)
    hide_eras()
    return pages, stamp, dropped


def hide_eras():
    """Раздел эр скрыт: на сервере в /eras/ остались старые файлы (rsync без
    --delete), поэтому кладём туда .htaccess с редиректом на главную. Убрать
    вместе с раскомментированием 15_concepts в COPY, когда раздел вернётся."""
    d = os.path.join(OUT, 'eras')
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, '.htaccess'), 'w', encoding='utf-8').write(
        'Redirect 302 /eras/ https://relictum.gallery/\n')
    print('   /eras/ скрыт: .htaccess-редирект на главную')


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
    t = t.replace('<div class="grid-objects" id="grid"></div>',
                  '<div class="grid-objects" id="grid">' + ''.join(cards) + '</div>', 1)
    t = t.replace('<div class="rail-count" id="count"></div>',
                  f'<div class="rail-count" id="count">Объектов: {len(items)}</div>', 1)
    open(p, 'w', encoding='utf-8').write(t)


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

    open(os.path.join(OUT, 'robots.txt'), 'w', encoding='utf-8').write(
        'User-agent: *\n'
        'Allow: /\n'
        + ''.join(f'Disallow: /{p}\n' for p in sorted(PRIVATE - {'404.html'})) +
        f'Sitemap: {DOMAIN}/sitemap.xml\n')

    htaccess = HTACCESS
    if not FORCE_HTTPS:
        # без сертификата любой уход на https = недоступный сайт
        htaccess = htaccess.replace(
            'RewriteCond %{REQUEST_URI} !^/\\.well-known/\nRewriteCond %{HTTPS} !=on\nRewriteRule ^(.*)$ https://relictum.gallery/$1 [R=301,L]',
            '# редирект на https выключен: сертификат ещё не выпущен (FORCE_HTTPS в build_public_site.py)')
        htaccess = htaccess.replace('RewriteRule ^(.*)$ https://%1/$1 [R=301,L]',
                                    'RewriteRule ^(.*)$ http://%1/$1 [R=301,L]')
    open(os.path.join(OUT, '.htaccess'), 'w', encoding='utf-8').write(htaccess)
    open(os.path.join(OUT, 'cors.php'), 'w', encoding='utf-8').write(CORS_PHP)
    open(os.path.join(OUT, 'send.php'), 'w', encoding='utf-8').write(SEND_PHP)
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
$SKIP   = array('date','type','consent','items','total','contact','page','payment');
$LABELS = array('name'=>'Имя','phone'=>'Телефон','email'=>'Почта','desc'=>'Запрос',
                'note'=>'Комментарий','addr'=>'Доставка','era'=>'Эпоха','budget'=>'Бюджет');
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
        $rich = (!empty($data['items']) && is_array($data['items']) && !empty($data['items'][0]['title']));
        $payload = array(
            'form_type' => $rich ? 'order' : 'relictum',
            'name'      => isset($data['name']) ? clean($data['name']) : 'Гость Relictum',
            'phone'     => $phone,
            'email'     => isset($data['email']) ? clean($data['email']) : '',
            'message'   => ($rich ? '' : "Заявка с сайта relictum.gallery — $kind\n\n")
                           . implode("\n", $lines),
            'consent'   => true,
        );
        if ($rich) {
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

HTACCESS = r"""# RELICTUM — relictum.gallery
RewriteEngine On

# только https и без www.
# ВАЖНО: /.well-known/ исключён — по нему Let's Encrypt проверяет домен по http,
# и редирект на https сломал бы выпуск и продление сертификата.
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://relictum.gallery/$1 [R=301,L]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [R=301,L]

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
