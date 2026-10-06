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
    return json.loads(res.stdout)


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
        lst.sort(key=lambda p: -len(p[0]))
        ci = re.compile(r'период|Мезозой|Кайнозой|Палеозой|Докембрий|Плейстоцен|Миоцен|зарождения жизни')
        self.frags = [(re.compile(r'(^|[^А-Яа-яЁёA-Za-z])' + re.escape(k) + r'(?![А-Яа-яЁёA-Za-z])',
                                  re.I if ci.search(k) else 0), v) for k, v in lst]

    @staticmethod
    def nkey(x):
        return re.sub(r'\s+', '', x).lower()

    def tr(self, s, lang):
        t = s.strip()
        if not t:
            return None
        hit = self.D.get(t) or self.L.get(t)
        if hit:
            v = hit[IDX[lang]] if len(hit) > IDX[lang] else None
            if v:
                return s.replace(t, v, 1)
        if not CYR.search(s) or len(t) > 70:
            return None
        out, changed = s, False
        for rx, val in self.frags:
            v = val[IDX[lang]] if len(val) > IDX[lang] else None
            if not v or not rx.search(out):
                continue
            out = rx.sub(lambda m: m.group(1) + v, out)
            changed = True
        # граммы: «1 267 г», «89 г, …» — но не «1967 г.»
        g2 = re.sub(r'(\d) г(?=$|[,;)])', lambda m: m.group(1) + ' ' + GRAM[IDX[lang]], out)
        if g2 != out:
            out, changed = g2, True
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
