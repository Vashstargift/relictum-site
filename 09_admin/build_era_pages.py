#!/usr/bin/env python3
"""RELICTUM — связывает страницы эр с каталогом.

Делает две вещи на каждой странице `15_concepts/era-*.html`:

1. **Блок существа → экспонат.** Если у дома есть предмет того же вида,
   под характеристиками появляется ссылка на него — такая же плашка, как
   кнопки перехода в эры на общей странице. Соответствие задаётся ниже
   в BEAST_LINK по латинскому имени: автоматика тут опасна, у части существ
   (тираннозавр, трицератопс) предмета нет вовсе, и ссылку ставить не на что.

2. **Нижний блок «Древности этой эпохи у вас дома»** — ВСЕ предметы этой эры
   из каталога, а не выборка руками. Эры сопоставлены полю `period`.

Запуск:  python3 09_admin/build_era_pages.py
Повторять после добавления экспонатов — иначе страницы эр отстанут от каталога.
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ERAS = os.path.join(ROOT, '15_concepts')

# Какие значения `period` показывать на каждой странице.
# «Мезофой» — полированные аммониты R–0224: они охватывают весь мезозой,
# поэтому попадают и в триас, и в юру, и в мел.
ERA_PERIODS = {
    'era-devonian':    ['Девон', 'Девонский период'],
    'era-triassic':    ['Триас', 'Мезозой', 'Триасовый период'],
    'era-jurassic':    ['Юра', 'Мезозой', 'Юрский период'],
    'era-cretaceous':  ['Мел', 'Мезозой', 'Меловой период'],
    'era-neogene':     ['Неоген', 'Миоцен', 'Неогеновый период'],
    'era-pleistocene': ['Плейстоцен'],
}

# Латинское имя в блоке существа → id экспоната того же вида.
# Пусто там, где предмета у дома нет.
BEAST_LINK = {
    'Dunkleosteus terrelli':    'R–0219',
    'Bothriolepis sp.':         'R–0209',
    'Keichousaurus hui':        'R–0212',
    'Mixosaurus sp.':           'R–0218',
    'Anchiornis huxleyi':       'R–0214',
    'Arietites sp.':            'R–0211',
    'Machairodus sp.':          'R–0208',
    'Dinocrocuta gigantea':     'R–0226',
    'Otodus megalodon':         'R–0201',
    'Mammuthus primigenius':    'R–0617',   # полный скелет — самый крупный из трёх
    'Ursus spelaeus':           'R–0604',
    'Cleoniceras besairiei':    'R–0224',   # аммолит снят с сайта, спираль показывают полированные аммониты
    'Tyrannosaurus rex':        'R–0221',   # коготь крупного теропода
    'Triceratops horridus':     'R–0271',   # череп трицератопса
}

RELIC_CSS = """/* Ссылка на экспонат того же вида — та же плашка, что кнопки перехода в эры */
.beast .relic{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:rgba(10,9,8,.5);border:1px solid rgba(233,201,138,.4);padding:8px 16px 8px 8px;text-decoration:none;color:var(--ivory);transition:.3s}
.beast .relic img{width:36px;height:44px;object-fit:cover}
.beast .relic b{font-weight:400;font-size:11px;letter-spacing:.16em;text-transform:uppercase;display:block}
.beast .relic small{display:block;font-size:8.5px;color:var(--gold);letter-spacing:.2em;text-transform:uppercase;margin-top:3px}
.beast .relic:hover{background:var(--gold);color:var(--black)}
.beast .relic:hover small{color:var(--black)}"""


def catalog():
    """Читаем каталог как данные — своего парсера JS не изобретаем."""
    js = (
        "global.window={};"
        f"eval(require('fs').readFileSync({json.dumps(os.path.join(ROOT,'shared','catalog.js'))},'utf8'));"
        "process.stdout.write(JSON.stringify(window.RELICTUM_CATALOG));"
    )
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def card(o):
    href = o.get('href') or ('../16_product_promos/exhibit.html?id=' + o['slug'])
    return (
        f'      <a class="card" href="{href}">\n'
        f'        <div class="im"><img src="../shared/img/{o["img"]}.jpg?v=12" alt="" loading="lazy" decoding="async"></div>\n'
        f'        <div class="b"><div class="id">{o["id"]}, {o["worldLabel"]}</div>'
        f'<h3>{o["name"]}</h3><div class="lat">{o["latin"]}</div>'
        f'<div class="pr"><b>{o["price"]}</b><span>Смотреть</span></div></div>\n'
        f'      </a>\n'
    )


def relic(o):
    return (
        f'    <a class="relic" href="{o.get("href")}">'
        f'<img src="../shared/img/{o["img"]}.jpg?v=12" alt="" loading="lazy" decoding="async">'
        f'<span><b>Смотреть экспонат →</b><small>{o["id"]}, {o["name"]}</small></span></a>\n'
    )


def main():
    cat = catalog()
    by_id = {o['id']: o for o in cat}

    for page, periods in sorted(ERA_PERIODS.items()):
        path = os.path.join(ERAS, page + '.html')
        if not os.path.exists(path):
            print(f'{page}: страницы нет'); continue
        s = open(path, encoding='utf-8').read()
        done = []

        # --- 1. стиль плашки
        if '.beast .relic' not in s:
            s = s.replace('</style>', RELIC_CSS + '\n</style>', 1)
            done.append('стиль плашки')

        # --- 2. ссылки на экспонаты в блоках существ
        added = 0

        def with_relic(m):
            nonlocal added
            blk = m.group(0)
            b = re.search(r'<div class="binom">(.*?)</div>', blk)
            if not b:
                return blk
            oid = BEAST_LINK.get(b.group(1).strip())
            blk = re.sub(r'\n\s*<a class="relic".*?</a>', '', blk, flags=re.S)  # старую убираем
            if not oid or oid not in by_id:
                return blk
            stat = re.search(r'(\n\s*<div class="stat">.*?</div>)', blk, re.S)
            if not stat:
                return blk
            added += 1
            return blk.replace(stat.group(1), stat.group(1) + '\n' + relic(by_id[oid]).rstrip('\n'), 1)

        s = re.sub(r'<section class="beast[^"]*">.*?</section>', with_relic, s, flags=re.S)
        if added:
            done.append(f'ссылок на экспонаты: {added}')

        # --- 3. нижний блок: все предметы эры
        items = [o for o in cat if o.get('period') in periods and not o.get('hidden')]
        items.sort(key=lambda o: o['id'])
        grid = '    <div class="grid">\n' + ''.join(card(o) for o in items) + '    </div>'
        new, n = re.subn(r'    <div class="grid">.*?\n    </div>', grid, s, count=1, flags=re.S)
        if n:
            s = new
            done.append(f'предметов в блоке эпохи: {len(items)}')
        else:
            done.append('⚠ блок с карточками не найден')

        open(path, 'w', encoding='utf-8').write(s)
        print(f'{page}: ' + ('; '.join(done) if done else 'без изменений'))


if __name__ == '__main__':
    main()
