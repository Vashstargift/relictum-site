#!/usr/bin/env python3
"""Языковые визитки лотов relictum.gallery (/en|zh|ar/objects/<slug>.html) — на сервере, после публикации.

Зачем (09.10.2026). Русские визитки пересобирает узел relictum-node.php при каждой публикации из CRM,
а языковые раньше появлялись только при полной сборке сайта на Маке — и только для лотов, чьи тексты
кто-то вручную перевёл в shared/i18n-lots.js. Новый или исправленный лот оставался без /en /zh /ar.

Что делает (запускает узел в фоне после write_data; можно и руками):
  1. Читает с сайта catalog.js и promo-data.js, собирает русские тексты видимых лотов и находит те,
     которых нет в словарях (i18n-lots.js — ручной, i18n-lots-auto.js — этот воркер, i18n-pages.js).
  2. Недостающие переводит Claude (ключ ANTHROPIC_API_KEY в .env рядом) и дописывает
     в shared/i18n-lots-auto.js — его же грузит браузерный переводчик shared/i18n.js.
  3. Для визиток, у которых изменился текст (или словари), заново собирает языковые версии тем же
     кодом, что и сборщик (i18n_static.localize): порог русского текста 10%, hreflang, canonical.
     Не прошедшие порог и скрытые (noindex) языковые версии удаляет.
  4. Правит hreflang у русских визиток и языковые адреса лотов в sitemap.xml.

Запуск:  python3 lang_lots.py --pending   (что делает узел: работает, пока есть флаг pending)
         python3 lang_lots.py --all       (пересобрать все визитки)
         python3 lang_lots.py --dry       (только показать, сколько текстов без перевода)
Папка воркера ~/relictum.gallery/i18n-worker/ — вне public_html. Код и static.json выкладывает
сборка (09_admin/i18n_worker + build_public_site.py), vendor/ (SDK anthropic), .env, state.json,
worker.log — только на сервере.
"""
import fcntl
import hashlib
import html as htmllib
import json
import os
import re
import sys
import time
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'vendor'))
import i18n_static as I  # noqa: E402

SITE = os.environ.get('RELICTUM_SITE') or os.path.join(os.path.dirname(HERE), 'public_html')
SHARED = os.path.join(SITE, 'shared')
AUTO = os.path.join(SHARED, 'i18n-lots-auto.js')
STATIC = os.path.join(HERE, 'static.json')
STATE = os.path.join(HERE, 'state.json')
PENDING = os.path.join(HERE, 'pending')
LOCK = os.path.join(HERE, 'run.lock')
LOG = os.path.join(HERE, 'worker.log')

MODEL = 'claude-opus-5-5'
BATCH = 12            # строк в одном запросе к модели (абзацы длинные — три языка на выходе)
MAX_NEW = 400         # потолок новых строк за один запуск — остальное доберёт следующий
CYR = re.compile(r'[А-Яа-яЁё]')
HAN = re.compile(r'[一-鿿]')
ARAB = re.compile(r'[؀-ۿ]')
FILELIKE = re.compile(r'^[\w./-]+\.(jpe?g|png|webp|mp4|svg|html)(\?.*)?$', re.I)
SKIP_KEYS = {'seo', 'img', 'video', 'poster', 'spin', 'heroVideo', 'diagram', 'href', 'slug', 'id', 'url'}


def log(msg):
    line = datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '  ' + msg
    print(line)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 512 * 1024:
            os.replace(LOG, LOG + '.1')
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def atomic(path, text):
    tmp = path + '.tmp-' + str(os.getpid())
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def env_key():
    if os.environ.get('ANTHROPIC_API_KEY'):
        return os.environ['ANTHROPIC_API_KEY']
    try:
        for ln in open(os.path.join(HERE, '.env'), encoding='utf-8'):
            if ln.startswith('ANTHROPIC_API_KEY='):
                return ln.split('=', 1)[1].strip().strip('"\'')
    except OSError:
        pass
    return ''


# --- тексты лотов -----------------------------------------------------------------------------
def lot_strings(catalog, promo):
    """Русские строки видимых лотов, которые показывают визитка и каталог."""
    out = []

    def add(s):
        if not isinstance(s, str):
            return
        for part in re.split(r'\n\s*\n|<br\s*/?>', s):
            part = part.strip()
            if part and CYR.search(part) and not FILELIKE.match(part):
                out.append(part)

    def walk(x, key=''):
        if key in SKIP_KEYS:
            return
        if isinstance(x, dict):
            for k, v in x.items():
                if isinstance(k, str) and CYR.search(k) and isinstance(v, str):
                    add(k)                      # факты профиля: «Сохранность»: «…»
                walk(v, k)
        elif isinstance(x, list):
            for v in x:
                walk(v, key)
        else:
            add(x)

    for o in catalog:
        if o.get('hidden') or o.get('status') == 'Архив':
            continue
        for k in ('name', 'category', 'period', 'era', 'region', 'meta', 'age', 'location', 'found',
                  'size', 'weight', 'mount', 'worldLabel', 'status', 'description'):
            add(o.get(k))
        walk(promo.get(o.get('id'), {}))
    seen, res = set(), []
    for s in out:
        if s not in seen:
            seen.add(s); res.append(s)
    return res


def untranslated(T, strings):
    miss = []
    for s in strings:
        for lang in I.LANGS:
            r = T.tr(s, lang)
            if r is None or CYR.search(r):
                miss.append(s)
                break
    return miss


SYSTEM = """You translate texts for RELICTUM, a Moscow gallery of rare natural-history objects (meteorites, dinosaur skeletons and skulls, ammonites, minerals, mammoth fauna). The site is in Russian; you produce the English, Simplified Chinese and Arabic versions.

For every Russian string, return its translation into English (en), Simplified Chinese (zh) and Modern Standard Arabic (ar).

- Register: a refined museum-catalogue voice — calm, precise, elegant. Natural in each language, not word-for-word. Never add, drop or soften facts.
- Science: use the standard terminology of palaeontology, mineralogy and meteoritics in each language (pallasite, octahedrite, Widmanstätten pattern, olivine, Late Pleistocene, Cretaceous period, etc.).
- Keep unchanged: Latin taxon names (Traumatocrinus guanlingensis), lot numbers like R–0231, numbers and their precision, the ≈ sign, ranges. Translate units (см → cm/厘米/سم, г → g/克/غ, кг → kg/千克/كغ, млн лет → million years / 百万年 / مليون سنة).
- Place names: the established form in each language (Магаданская область → Magadan Oblast / 马加丹州 / أوبلاست ماغادان).
- A short string (category, period, place, label) stays short; keep its capitalisation style.
- Return exactly one item per input index."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'items': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {'i': {'type': 'integer'}, 'en': {'type': 'string'},
                               'zh': {'type': 'string'}, 'ar': {'type': 'string'}},
                'required': ['i', 'en', 'zh', 'ar'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['items'],
    'additionalProperties': False,
}


def good(ru, en, zh, ar):
    """Перевод годится: три языка, без кириллицы; иероглифы и арабское письмо обязательны, только если
    в исходнике есть слова («1983 г.» → «1983» / «1983年» / «عام 1983» — годится и без них)."""
    if not (en and zh and ar) or CYR.search(en + zh + ar):
        return False
    if len(CYR.findall(ru)) >= 6 and (not HAN.search(zh) or not ARAB.search(ar)):
        return False
    return True


def translate(strings):
    """[ru] → {ru: [en, zh, ar]} через Claude; плохие ответы отбрасываются (их возьмёт следующий запуск)."""
    import anthropic
    key = env_key()
    if not key:
        log('! нет ANTHROPIC_API_KEY — перевод пропущен')
        return {}
    client = anthropic.Anthropic(api_key=key, max_retries=3)
    got = {}
    for n in range(0, len(strings), BATCH):
        chunk = strings[n:n + BATCH]
        payload = json.dumps([{'i': i, 'ru': s} for i, s in enumerate(chunk)], ensure_ascii=False)
        try:
            with client.beta.messages.stream(
                model=MODEL,
                max_tokens=64000,
                system=SYSTEM,
                messages=[{'role': 'user', 'content': 'Translate each item:\n' + payload}],
                output_config={'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
                betas=['server-side-fallback-2026-07-01'],
                fallbacks='default',
            ) as stream:
                msg = stream.get_final_message()
        except anthropic.RateLimitError as e:
            log(f'! лимит запросов, пауза: {e}'); time.sleep(30); continue
        except anthropic.APIStatusError as e:
            log(f'! ошибка API {e.status_code}: {str(e)[:300]}'); continue
        except anthropic.APIConnectionError as e:
            log(f'! нет связи с API: {e}'); continue
        if msg.stop_reason != 'end_turn':
            log(f'! ответ модели не завершён: {msg.stop_reason}'); continue
        text = ''.join(b.text for b in msg.content if b.type == 'text')
        try:
            items = json.loads(text)['items']
        except (ValueError, KeyError):
            log('! ответ модели не JSON'); continue
        for it in items:
            i = it.get('i')
            if not isinstance(i, int) or not 0 <= i < len(chunk):
                continue
            en, zh, ar = (it.get('en') or '').strip(), (it.get('zh') or '').strip(), (it.get('ar') or '').strip()
            if not good(chunk[i], en, zh, ar):
                continue
            got[chunk[i]] = [en, zh, ar]
        log(f'  перевод: {min(n + BATCH, len(strings))}/{len(strings)}, принято {len(got)}')
    return got


def translate_hermes(strings):
    """Запасной путь с Мака (09.10.2026, пока на сервере нет рабочего ключа Anthropic): тот же промпт
    через ChatGPT в профиле Hermes audit. Запуск: python3 lang_lots.py --via-hermes (RELICTUM_SITE — зеркало)."""
    import subprocess
    got = {}
    env = dict(os.environ, HERMES_HOME=os.path.expanduser('~/.hermes/profiles/audit'))
    for n in range(0, len(strings), BATCH):
        chunk = strings[n:n + BATCH]
        payload = json.dumps([{'i': i, 'ru': s} for i, s in enumerate(chunk)], ensure_ascii=False)
        prompt = (SYSTEM + '\n\nReturn ONLY a JSON object {"items":[{"i":0,"en":"…","zh":"…","ar":"…"}, …]} '
                  'with one item per input index, no commentary.\n\nTranslate each item:\n' + payload)
        try:
            r = subprocess.run(['hermes', '-z', prompt, '--provider', 'openai-codex', '-m', 'gpt-5.5', '-t', '', '--ignore-rules'],
                               capture_output=True, text=True, timeout=900, env=env)
            text = r.stdout
            items = json.loads(text[text.index('{'):text.rindex('}') + 1])['items']
        except Exception as e:
            log(f'! hermes: {e!r}'); continue
        for it in items:
            i = it.get('i')
            if not isinstance(i, int) or not 0 <= i < len(chunk):
                continue
            en, zh, ar = (it.get('en') or '').strip(), (it.get('zh') or '').strip(), (it.get('ar') or '').strip()
            if not good(chunk[i], en, zh, ar):
                continue
            got[chunk[i]] = [en, zh, ar]
        log(f'  перевод (hermes): {min(n + BATCH, len(strings))}/{len(strings)}, принято {len(got)}')
    return got


def save_auto(new):
    cur = I.read_js_object(AUTO)
    cur.update(new)
    atomic(AUTO, '/* RELICTUM — переводы текстов лотов, сделанные сервером после публикации из CRM\n'
                 '   (09_admin/i18n_worker/lang_lots.py). Ручной словарь i18n-lots.js главнее. Не править руками. */\n'
                 'window.RELICTUM_I18N_LOTS_AUTO=' + json.dumps(cur, ensure_ascii=False, sort_keys=True) + ';\n')
    return len(cur)


# --- визитки ----------------------------------------------------------------------------------
ALT = re.compile(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n?')
STAMP = re.compile(r'\?v=[a-f0-9]{8}')


def page_hash(t):
    return hashlib.sha1(STAMP.sub('', ALT.sub('', t)).encode('utf-8')).hexdigest()[:16]


def dict_hash():
    h = hashlib.sha1()
    for p in (STATIC, os.path.join(SHARED, 'i18n-lots.js'), os.path.join(SHARED, 'i18n-pages.js'), AUTO,
              os.path.join(HERE, 'i18n_static.py')):
        try:
            h.update(open(p, 'rb').read())
        except OSError:
            pass
    return h.hexdigest()[:16]


def lang_files(lang):
    base = os.path.join(SITE, lang)
    res = set()
    for dp, _, fs in os.walk(base):
        for f in fs:
            if f.endswith('.html'):
                res.add(os.path.relpath(os.path.join(dp, f), base).replace(os.sep, '/'))
    return res


def make_webp():
    """WebP рядом с фото лотов ph_*.jpg, загруженными прямо из CRM (сборка делает их только для файлов из репо).
    Каталог и визитка просят .webp и откатываются на .jpg — без WebP лишний 404 и тяжёлая картинка (09.10.2026)."""
    try:
        from PIL import Image
    except ImportError:
        return 0
    imgdir, made = os.path.join(SHARED, 'img'), 0
    for f in os.listdir(imgdir):
        if not (f.startswith('ph_') and f.endswith('.jpg')):
            continue
        jp = os.path.join(imgdir, f); wp = jp[:-4] + '.webp'
        if os.path.exists(wp) and os.path.getmtime(wp) >= os.path.getmtime(jp):
            continue
        try:
            with Image.open(jp) as im:
                im.save(wp + '.tmp', 'WEBP', quality=80, method=4)
            os.chmod(wp + '.tmp', 0o644); os.replace(wp + '.tmp', wp); made += 1
        except Exception as e:
            log(f'! webp {f}: {e!r}')
    return made


def run_once(force=False, dry=False, no_translate=False, via_hermes=False, translate_only=False):
    if not dry:
        n = make_webp()
        if n:
            log(f'webp для фото лотов: {n}')
    catalog = I.read_js_object(os.path.join(SHARED, 'catalog.js'))
    promo = I.read_js_object(os.path.join(SITE, 'objects', 'promo-data.js'))
    if not isinstance(catalog, list) or not catalog:
        log('! catalog.js не прочитан'); return
    visible = [o for o in catalog if not o.get('hidden') and o.get('status') != 'Архив']
    names = [o['name'] for o in visible if o.get('name')]

    def translator():
        T = I.Translator(I.load_dicts_static(STATIC, SHARED))
        T.add_names(names)
        return T

    T = translator()
    miss = untranslated(T, lot_strings(catalog, promo))
    log(f'тексты лотов без перевода: {len(miss)}')
    if dry:
        for s in miss[:40]:
            print('   ·', s[:110].replace('\n', ' '))
        return
    if miss and not no_translate:
        got = (translate_hermes if via_hermes else translate)(miss[:MAX_NEW])
        if got:
            total = save_auto(got)
            log(f'словарь автоперевода: +{len(got)}, всего {total}')
            T = translator()
    if translate_only:
        return

    try:
        state = json.load(open(STATE, encoding='utf-8'))
    except (OSError, ValueError):
        state = {}
    dh = dict_hash()
    if state.get('dict') != dh:
        force = True
    hashes = {} if force else dict(state.get('pages', {}))

    objdir = os.path.join(SITE, 'objects')
    ru = {}
    for f in sorted(os.listdir(objdir)):
        if f.endswith('.html') and f != 'exhibit.html' and re.match(r'^[a-z0-9-]+\.html$', f):
            ru['objects/' + f] = open(os.path.join(objdir, f), encoding='utf-8').read()

    have = {lang: lang_files(lang) for lang in I.LANGS}
    todo, langs_of, out = [], {}, {}
    for rel, t in ru.items():
        noindex = re.search(r'<meta name="robots" content="[^"]*noindex', t)
        h = 'noindex' if noindex else page_hash(t)
        if hashes.get(rel) == h:
            continue
        todo.append(rel); hashes[rel] = h
        if noindex:
            langs_of[rel] = []
            continue
        src = ALT.sub('', t)
        ok = []
        for lang in I.LANGS:
            o = T.page(src, lang)
            if I.visible_share(o) <= I.LANG_MAX_CYR:
                out[(lang, rel)] = o; ok.append(lang)
        langs_of[rel] = ok
    for rel in todo:                                # кто остался / появился на каждом языке
        for lang in I.LANGS:
            (have[lang].add if lang in langs_of[rel] else have[lang].discard)(rel)

    written = removed = 0
    for rel in todo:
        for lang in I.LANGS:
            p = os.path.join(SITE, lang, rel)
            if (lang, rel) in out:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                atomic(p, I.localize(T, out[(lang, rel)], rel, lang, have[lang], langs_of[rel]))
                written += 1
            elif os.path.exists(p):
                os.remove(p); removed += 1
        # hreflang у русской визитки
        p = os.path.join(SITE, rel)
        t = ru[rel]
        n = ALT.sub('', t)
        if langs_of[rel]:
            n = n.replace('</head>', I.alternates(rel, langs_of[rel]) + '</head>', 1)
        if n != t:
            atomic(p, n)

    if todo:
        update_sitemap(have)
    state = {'dict': dh, 'pages': hashes, 'ran': datetime.now().isoformat(timespec='seconds')}
    atomic(STATE, json.dumps(state, ensure_ascii=False, indent=0))
    log(f'визитки: изменилось {len(todo)}, языковых записано {written}, удалено {removed}; '
        + ', '.join(f'{l} — {sum(1 for r in have[l] if r.startswith("objects/"))}' for l in I.LANGS))


def update_sitemap(have):
    p = os.path.join(SITE, 'sitemap.xml')
    try:
        sm = open(p, encoding='utf-8').read()
    except OSError:
        return
    urls = re.findall(r'<url>.*?</url>', sm, re.S)
    lang_obj = re.compile(r'<loc>' + re.escape(I.DOMAIN) + r'/(en|zh|ar)/objects/([^<]+)</loc>')
    keep, old = [], {}
    for u in urls:
        m = lang_obj.search(u)
        if m:
            old[(m.group(1), 'objects/' + m.group(2))] = u.strip()
        else:
            keep.append(u.strip())
    today = date.today().isoformat()
    for lang in I.LANGS:
        for rel in sorted(r for r in have[lang] if r.startswith('objects/')):
            keep.append(old.get((lang, rel)) or
                        f'<url><loc>{I.lang_url(lang, rel)}</loc><lastmod>{today}</lastmod><priority>0.7</priority></url>')
    body = '\n'.join('  ' + u for u in keep)
    new = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n'
    if new != sm:
        atomic(p, new)


def main():
    args = set(sys.argv[1:])
    lock = open(LOCK, 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log('уже работает другой запуск — он подхватит флаг pending')
        return
    try:
        if '--pending' in args:
            rounds = 0
            while os.path.exists(PENDING) and rounds < 5:
                os.remove(PENDING); rounds += 1
                run_once()
        else:
            run_once(force='--all' in args, dry='--dry' in args, no_translate='--no-translate' in args,
                     via_hermes='--via-hermes' in args, translate_only='--translate-only' in args)
    except Exception as e:                       # воркер фоновый: ошибку — в журнал, сайт не трогаем
        import traceback
        log('! сбой: ' + repr(e) + '\n' + traceback.format_exc())
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)


if __name__ == '__main__':
    main()
