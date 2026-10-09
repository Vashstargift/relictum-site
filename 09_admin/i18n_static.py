"""Статичные языковые версии relictum.gallery (EN / 中文 / العربية).

На сайте перевод делает браузер: shared/i18n.js подменяет русский текст по словарям
(D, F, H из i18n.js, тексты лотов из i18n-lots.js и страниц из i18n-pages.js). Поисковики и нейросети такой
перевод почти не видят — у страницы один адрес, и он русский. Здесь те же словари
и те же правила применяются при сборке, и каждая переведённая страница получает
свой адрес: /en/…, /zh/…, /ar/….

Правила перевода повторяют tr()/heads() из i18n.js: точное совпадение строки;
для строк до 70 символов — замена известных фрагментов («R–0610, Монументы»,
«Ляонин, Китай, ≈ 125 млн лет»); заголовки h1–h3 — целиком по словарю H.
"""
import html as htmllib
import json
import os
import re
import subprocess

LANGS = ['en', 'zh', 'ar']
IDX = {'en': 0, 'zh': 1, 'ar': 2}
GRAM = ['g', '克', 'غ']
UNITS = {'см': ['cm', '厘米', 'سم'], 'мм': ['mm', '毫米', 'مم'], 'м': ['m', '米', 'م']}
HREFLANG = {'ru': 'ru', 'en': 'en', 'zh': 'zh-Hans', 'ar': 'ar'}
CYR = re.compile(r'[А-Яа-яЁё]')
LETTER_CYR = re.compile(r'[А-Яа-яЁё]')
LETTER_LAT = re.compile(r'[A-Za-z一-鿿؀-ۿ]')

_EXPORT_JS = r"""
const fs=require('fs');
const src=fs.readFileSync(process.argv[1],'utf8');
function grab(name){const m=src.match(new RegExp('\\nvar '+name+'=(\\{[\\s\\S]*?\\n\\});'));return m?eval('('+m[1]+')'):{};}
const fo=src.match(/var FRAG_OK=\(([\s\S]*?)\)\.split\("\|"\)/);
const FRAG_OK=fo?eval(fo[1]).split('|'):[];
global.window={};
try{ eval(fs.readFileSync(process.argv[2],'utf8')); }catch(e){}
try{ eval(fs.readFileSync(process.argv[3],'utf8')); }catch(e){}
const L=Object.assign({},window.RELICTUM_I18N_PAGES||{},window.RELICTUM_I18N_LOTS||{});
process.stdout.write(JSON.stringify({D:grab('D'),F:grab('F'),H:grab('H'),FRAG_OK:FRAG_OK,L:L}));
"""


def load_dicts(out_dir):
    js = os.path.join(out_dir, 'shared', 'i18n.js')
    lots = os.path.join(out_dir, 'shared', 'i18n-lots.js')
    pages = os.path.join(out_dir, 'shared', 'i18n-pages.js')   # главная, подарки, посадочные — пишет сборка
    res = subprocess.run(['node', '-e', _EXPORT_JS, js, lots, pages], capture_output=True, text=True, encoding='utf-8', check=True)
    d = json.loads(res.stdout)
    # 09.10.2026: тексты лотов, которые сервер перевёл сам после публикации из CRM (i18n_worker) —
    # ниже ручного словаря: ручной перевод, если он есть, главнее
    auto = read_js_object(os.path.join(out_dir, 'shared', 'i18n-lots-auto.js'))
    d['L'] = dict(auto, **d['L'])
    return d


def read_js_object(path):
    """window.X = {…}; → dict. Файлы словарей пишутся как JSON, так что хватает json."""
    try:
        src = open(path, encoding='utf-8').read()
    except OSError:
        return {}
    i = src.find('=', src.find('window.'))
    if i < 0:
        return {}
    try:
        return json.JSONDecoder().raw_decode(src[i + 1:].lstrip())[0]
    except ValueError:
        return {}


def load_dicts_static(static_json, shared_dir):
    """То же, что load_dicts, но без node (на сервере его нет): D, F, H, FRAG_OK — из снимка,
    который сборка кладёт рядом с воркером; тексты лотов и страниц — из файлов сайта."""
    d = json.load(open(static_json, encoding='utf-8'))
    L = dict(read_js_object(os.path.join(shared_dir, 'i18n-lots-auto.js')))
    L.update(read_js_object(os.path.join(shared_dir, 'i18n-pages.js')))
    L.update(read_js_object(os.path.join(shared_dir, 'i18n-lots.js')))
    d['L'] = L
    return d


class Translator:
    def __init__(self, d):
        self.D, self.F, self.H, self.L = d['D'], d['F'], d['H'], d['L']
        self.HN = {self.nkey(k): v for k, v in self.H.items()}
        lst = []
        for k in d['FRAG_OK']:
            if k in self.D:
                lst.append((k, self.D[k]))
        for k, v in self.D.items():
            if len(k) >= 12 and '.' not in k and k not in d['FRAG_OK']:
                lst.append((k, v))
        lst += list(self.F.items())
        # 07.10.2026: названия лотов (i18n-lots) — тоже фрагменты: заголовок «Аметист, 45 см — R–0249, RELICTUM»
        # целиком в словаре не найдётся, а название внутри него — да
        lst += [(k, v) for k, v in self.L.items() if 4 <= len(k) <= 60 and '.' not in k and '\n' not in k]
        lst.sort(key=lambda p: -len(p[0]))
        ci = re.compile(r'период|Мезозой|Кайнозой|Палеозой|Докембрий|Плейстоцен|Миоцен|зарождения жизни')
        self.frags = [(re.compile(r'(^|[^А-Яа-яЁёA-Za-z])' + re.escape(k) + r'(?![А-Яа-яЁёA-Za-z])',
                                  re.I if ci.search(k) else 0), v) for k, v in lst]

    def add_names(self, names):
        """Названия лотов — фрагментами любой длины (07.10.2026): «Аметист, 45 см — R–0249, RELICTUM»."""
        have = {rx.pattern for rx, _ in self.frags}
        extra = []
        for n in set(names):
            v = self.D.get(n) or self.L.get(n)
            if v and len(n) >= 4:
                rx = re.compile(r'(^|[^А-Яа-яЁёA-Za-z])' + re.escape(n) + r'(?![А-Яа-яЁёA-Za-z])')
                if rx.pattern not in have:
                    extra.append((rx, v))
        self.frags = sorted(self.frags + extra, key=lambda p: -len(p[0].pattern))

    @staticmethod
    def nkey(x):
        return re.sub(r'\s+', '', x).lower()

    def tr(self, s, lang, maxlen=70):
        t = s.strip()
        if not t:
            return None
        hit = self.D.get(t) or self.L.get(t)
        if hit:
            v = hit[IDX[lang]] if len(hit) > IDX[lang] else None
            if v:
                return s.replace(t, v, 1)
        if not CYR.search(s) or len(t) > maxlen:
            return None
        out, changed = s, False
        for rx, val in self.frags:
            v = val[IDX[lang]] if len(val) > IDX[lang] else None
            if not v or not rx.search(out):
                continue
            out = rx.sub(lambda m: m.group(1) + v, out)
            changed = True
        # граммы: «1 267 г», «89 г, …» — но не «1967 г.»
        g2 = re.sub(r'(\d) г(?=$|[,;)]|\s[—–])', lambda m: m.group(1) + ' ' + GRAM[IDX[lang]], out)
        if g2 != out:
            out, changed = g2, True
        # сантиметры, миллиметры, метры: «45 см», «28 × 31 см», «1,7 м»
        u2 = re.sub(r'(\d) (см|мм|м)(?=$|[\s,;)—–])', lambda m: m.group(1) + ' ' + UNITS[m.group(2)][IDX[lang]], out)
        if u2 != out:
            out, changed = u2, True
        # 09.10.2026: в английском и китайском десятичная точка: «7,4 kg» → «7.4 kg» (тысячи «1,267» не трогаем)
        if changed and lang in ('en', 'zh'):
            out = re.sub(r'(\d),(\d{1,2})(?!\d)', r'\1.\2', out)
        return out if changed else None

    # --- страница целиком -------------------------------------------------
    def page(self, src, lang):
        parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->)', src, flags=re.S | re.I)
        out = []
        for part in parts:
            if part.startswith(('<script', '<style', '<!--', '<SCRIPT')):
                out.append(part)
                continue
            out.append(self._markup(part, lang))
        return ''.join(out)

    def _heads(self, t, lang):
        def rep(m):
            text = htmllib.unescape(re.sub(r'<[^>]+>', '', m.group(3)))
            v = self.HN.get(self.nkey(text))
            if v and len(v) > IDX[lang] and v[IDX[lang]]:
                return m.group(1) + v[IDX[lang]] + m.group(4)
            return m.group(0)
        return re.sub(r'(<(h[123])\b[^>]*>)(.*?)(</\2>)', rep, t, flags=re.S | re.I)

    def _markup(self, t, lang):
        t = self._heads(t, lang)
        # атрибуты, которые видит человек и робот
        def attr(m):
            val = htmllib.unescape(m.group(3))
            o = self.tr(val, lang)
            return m.group(1) + m.group(2) + htmllib.escape(o, quote=True) + m.group(2) if o else m.group(0)
        t = re.sub(r'(\s(?:alt|placeholder|aria-label|title)=)(")([^"]*)"', attr, t)
        # текст между тегами
        def text(m):
            raw = m.group(0)
            val = htmllib.unescape(raw)
            o = self.tr(val, lang)
            return htmllib.escape(o, quote=False) if o else raw
        return re.sub(r'(?<=>)[^<]+', text, t)


def visible_share(src):
    """Доля кириллицы среди букв видимого текста (без скриптов, стилей и head)."""
    body = src[src.find('<body'):] if '<body' in src else src
    body = re.sub(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->', ' ', body, flags=re.S | re.I)
    txt = htmllib.unescape(re.sub(r'<[^>]+>', ' ', body))
    c, l = len(LETTER_CYR.findall(txt)), len(LETTER_LAT.findall(txt))
    return c / (c + l) if c + l else 1.0


# --- языковая версия страницы целиком (09.10.2026) -------------------------------------------
# Общий код сборщика (lang_versions в build_public_site.py) и серверного воркера (i18n_worker),
# который пересобирает языковые визитки лотов после публикации из CRM. Логика перенесена из
# сборщика без изменений — результат сборки байт-в-байт прежний.
DOMAIN = 'https://relictum.gallery'
LANG_MAX_CYR = 0.10
CYR3 = re.compile(r'[А-Яа-яЁё]{3,}')
DESC_FALLBACK = {
    'en': '{name} — a natural-history piece in the RELICTUM collection, Moscow: provenance, age, photos and price.',
    'zh': '{name}——RELICTUM 莫斯科收藏中的自然史珍品：来源、年代、照片与价格。',
    'ar': '{name} — قطعة من التاريخ الطبيعي في مجموعة RELICTUM في موسكو: المنشأ والعمر والصور والسعر.',
}
DESC_FALLBACK_NONAME = {
    'en': 'RELICTUM, Moscow: dinosaur skeletons, meteorites, minerals and mammoth fauna with provenance passports.',
    'zh': 'RELICTUM 莫斯科：恐龙骨架、陨石、矿物与猛犸动物群，均附来源护照。',
    'ar': 'RELICTUM في موسكو: هياكل ديناصورات ونيازك ومعادن وحيوانات الماموث مع جوازات منشأ.',
}


ADDRESS = {   # адрес галереи в разметке Store/Organization
    'streetAddress': {'ул. Большая Якиманка, 22': ['22 Bolshaya Yakimanka St', '大亚基曼卡街22号', 'شارع بولشايا ياكيمانكا، 22']},
    'addressLocality': {'Москва': ['Moscow', '莫斯科', 'موسكو']},
    'addressRegion': {'Москва': ['Moscow', '莫斯科', 'موسكو']},
    'addressCountry': {'Россия': ['Russia', '俄罗斯', 'روسيا']},
}


def cut_desc(v, limit=160):
    """Описание для сниппета: целыми предложениями, если укладываются; иначе по слову с «…» (09.10.2026)."""
    v = v.strip()
    if len(v) <= limit + 5:
        return v
    head = v[:limit + 1]
    ends = [m.end() for m in re.finditer(r'[.!?。！？](?=\s|$)', head)]
    if ends and ends[-1] >= 60:
        return v[:ends[-1]].strip()
    cut = v[:limit]; sp = cut.rfind(' ')
    return (cut[:sp] if sp > 80 else cut).rstrip(' ,;:') + '…'


def local_url(v, lang, have):
    """Абсолютный адрес сайта → адрес языковой версии, если она есть."""
    if not v.startswith(DOMAIN + '/'):
        return v
    path, tail = re.match(r'([^?#]*)(.*)', v[len(DOMAIN) + 1:]).groups()
    rel = path or 'index.html'
    if rel.endswith('/'):
        rel += 'index.html'
    return lang_url(lang, rel) + tail if rel in have else v


def lang_url(lang, rel):
    return DOMAIN + '/' + ('' if lang == 'ru' else lang + '/') + ('' if rel == 'index.html' else rel)


def alternates(rel, langs):
    """hreflang-связка страницы rel; langs — языки, на которых у неё есть версия."""
    tags = [f'<link rel="alternate" hreflang="ru" href="{lang_url("ru", rel)}">']
    tags += [f'<link rel="alternate" hreflang="{HREFLANG[l]}" href="{lang_url(l, rel)}">' for l in LANGS if l in langs]
    tags.append(f'<link rel="alternate" hreflang="x-default" href="{lang_url("ru", rel)}">')
    return '\n'.join(tags) + '\n'


def meta_tr(T, t, lang, have=None):
    def one(m, maxlen=70):
        o = T.tr(htmllib.unescape(m.group(2)), lang, maxlen)
        return m.group(1) + (htmllib.escape(o, quote=True) if o else m.group(2)) + m.group(3)
    title = lambda m: one(m, 160)   # заголовки лотов длиннее 70 знаков: «…, 7 кг (семь индивидуалов) — R–0302» (09.10.2026)
    t = re.sub(r'(<title>)(.*?)(</title>)', title, t, count=1, flags=re.S)
    t = re.sub(r'(<meta (?:property="og:title"|name="twitter:title") content=")([^"]*)(")', title, t)
    t = re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")([^"]*)(")', one, t)
    # 07.10.2026: описание, оставшееся русским (первый абзац текста лота из CRM — перевода у него нет),
    # заменяем фразой на языке версии из переведённого названия — полурусский сниппет хуже шаблонного
    ttl = htmllib.unescape((re.search(r'<title>(.*?)</title>', t, re.S) or [None, ''])[1]).split(' | ')[0]
    ttl = re.sub(r',?\s*RELICTUM\s*$', '', ttl).strip(' ,—')          # «Sea lily — R–0231»: номер лота делает шаблон уникальным
    name = ttl if ttl and not CYR3.search(ttl) else ''
    fb = DESC_FALLBACK[lang].format(name=name) if name else DESC_FALLBACK_NONAME[lang]

    def full_tr(ru):
        # SEO-описание — первый абзац лота, обрезанный до ~160 знаков с «…»: берём перевод целого абзаца
        # из словаря лотов и обрезаем так же. Иначе — шаблон.
        base = ru.rstrip('…').strip()
        if len(base) < 40:
            return None
        hits = [k for k in T.L if k.startswith(base)]
        if len(hits) != 1:
            return None
        v = T.L[hits[0]]; v = v[LANGS.index(lang)] if len(v) > LANGS.index(lang) else None
        if not v:
            return None
        return cut_desc(v)

    def fix(m):
        ru = htmllib.unescape(m.group(2))
        if not CYR3.search(ru):
            return m.group(0)
        return m.group(1) + htmllib.escape(full_tr(ru) or fb, quote=True) + m.group(3)
    t = re.sub(r'(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")([^"]*)(")', fix, t)

    def ld(m):
        try:
            d = json.loads(m.group(2))
        except Exception:
            return m.group(0)

        def walk(x):
            if isinstance(x, dict):
                r = {}
                for k, v in x.items():
                    if isinstance(v, str) and k in ('name', 'category', 'value'):
                        r[k] = T.tr(v, lang, maxlen=160) or v
                    elif isinstance(v, str) and k in ('headline', 'description', 'text'):
                        r[k] = T.tr(v, lang) or v
                    elif isinstance(v, str) and k in ADDRESS and v in ADDRESS[k]:
                        r[k] = ADDRESS[k][v][LANGS.index(lang)]
                    elif isinstance(v, str) and k in ('url', 'item', '@id') and have is not None:
                        r[k] = local_url(v, lang, have)        # 09.10.2026: разметка ведёт на свою языковую версию
                    else:
                        r[k] = walk(v)
                if x.get('inLanguage') == 'ru':
                    r['inLanguage'] = 'zh-Hans' if lang == 'zh' else lang
                if isinstance(r.get('description'), str) and CYR3.search(r['description']) and x.get('@type') in ('Product', 'CollectionPage', 'WebPage'):
                    r['description'] = fb
                if isinstance(r.get('description'), str) and CYR3.search(r['description']) and x.get('@type') in ('Organization', 'Store', 'WebSite', 'LocalBusiness'):
                    r['description'] = DESC_FALLBACK_NONAME[lang]
                if isinstance(r.get('name'), str) and CYR3.search(r['name']) and x.get('@type') in ('Store', 'Organization', 'LocalBusiness', 'WebSite'):
                    r['name'] = 'RELICTUM'
                return r
            if isinstance(x, list):
                return [walk(v) for v in x]
            return x
        d = walk(d)
        return m.group(1) + json.dumps(d, ensure_ascii=False).replace('<', '\\u003c') + m.group(3)   # «</script>» в тексте не рвёт блок
    return re.sub(r'(<script type="application/ld\+json">)(.*?)(</script>)', ld, t, flags=re.S)


def localize(T, t, rel, lang, have, langs):
    """Переведённая страница t (результат T.page) → готовый файл /<lang>/<rel>.
    have — страницы, у которых есть версия на этом языке (на них переводим ссылки);
    langs — языки, на которых есть rel (для hreflang)."""
    folder = rel.rsplit('/', 1)[0] + '/' if '/' in rel else ''
    me = lang_url(lang, rel)

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
            return m.group(1) + lang_url(lang, tgt) + tail + m.group(3)
        return m.group(0)
    t = re.sub(r'(\shref=")([^"]*)(")', href, t)
    t = meta_tr(T, t, lang, have)
    t = re.sub(r'<html lang="[^"]*"', '<html lang="' + ('zh-CN' if lang == 'zh' else lang) + '" data-rl-lang="' + lang + '"'
               + (' dir="rtl"' if lang == 'ar' else ''), t, count=1)
    t = re.sub(r'<link rel="canonical"[^>]*>\s*', '', t)
    t = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + me + m.group(2), t, count=1)
    t = re.sub(r'(<head[^>]*>)', lambda m: m.group(1) + f'\n<base href="/{folder}">', t, count=1)
    return t.replace('</head>', f'<link rel="canonical" href="{me}">\n' + alternates(rel, langs) + '</head>', 1)
