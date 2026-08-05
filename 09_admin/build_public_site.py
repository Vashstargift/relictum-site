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
import os, re, shutil, sys
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
# lab.html — внутренняя песочница прототипов с макетными объектами, наружу не идёт
INTERNAL = {'lab.html',          # внутренняя песочница прототипов
            'mammoth-tusk.html'} # страница объекта R–0403, которого нет в коллекции
def html_only(f): return f.endswith('.html') and f not in INTERNAL
def html_and_js(f): return (f.endswith('.html') or f.endswith('.js')) and f not in INTERNAL
def showcase(f): return (f.endswith('.html') or f.endswith('.css')) and f != 'index-v2.html'

COPY = [
    ('02_site_v1_gallery', '', showcase),
    ('16_product_promos', 'objects', html_and_js),
    ('15_concepts', 'eras', html_only),
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
DATA_FILES = ['shared/catalog.js', '16_product_promos/promo-data.js',
              'shared/shop.js', 'shared/nav.js', 'shared/biography.js',
              'shared/chrome.css', 'shared/shop.css', 'shared/fonts.css',
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

    dropped = prune_media()
    write_extras(pages)
    return pages, stamp, dropped


# Медиа, которое лежит в репозитории, но на публичных страницах не встречается,
# в срез не попадает: это библиотека промо-роликов, кадры для PDF и черновые
# генерации. В репозитории они остаются, на хостинг не уезжают.
MEDIA_EXT = ('.jpg', '.jpeg', '.png', '.mp4', '.webp', '.gif', '.svg', '.ico')
KEEP_DIRS = ('shared/brand',)          # логотипы и фавиконы не трогаем никогда


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
            # имя целиком или без расширения (в данных картинки задаются как "ph_slug")
            if f in blob or stem in blob:
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
    open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(PAGE_404)


HTACCESS = """# RELICTUM — relictum.gallery
RewriteEngine On

# только https и без www.
# ВАЖНО: /.well-known/ исключён — по нему Let's Encrypt проверяет домен по http,
# и редирект на https сломал бы выпуск и продление сертификата.
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://relictum.gallery/$1 [R=301,L]
RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [R=301,L]

ErrorDocument 404 /404.html

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

# шрифты дома лежат у нас же — отдаём с правильным типом и надолго
<IfModule mod_mime.c>
  AddType font/woff2 .woff2
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
