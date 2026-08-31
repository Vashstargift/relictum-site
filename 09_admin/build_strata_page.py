#!/usr/bin/env python3
"""RELICTUM — связывает страницу пластов с каталогом.

`15_concepts/strata.html` — спуск сквозь геологические слои. У каждого слоя есть
строка «что здесь находят» и пара декоративных плашек с предметами.

Проблема, которую чинит скрипт: и находки, и плашки были придуманы под красоту —
«Зуб T. rex», «Трицератопс», «Окаменелое дерево», «Ископаемые рыбы», «Янтарь
с насекомым», «Минералы Земли». Таких предметов у дома нет, а ссылки вели просто
в раздел каталога, а не на экспонат. Теперь и подписи, и картинки, и ссылки
берутся из каталога — показываем только то, что действительно есть.

Соответствие «слой → экспонаты» задано явно: слои размечены геологическим
возрастом, а не полем `period`, поэтому автоматика тут не годится.

Запуск:  python3 09_admin/build_strata_page.py
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, '15_concepts', 'strata.html')

# Слой определяется по заголовку. Значения — id экспонатов этого возраста.
# Первый в списке идёт и в декоративную плашку слоя.
LAYERS = {
    'Мерзлота помнит мамонтов':        ['R–0607', 'R–0604', 'R–0608'],
    'Океан тёплый, хищник — гигантский': ['R–0201', 'R–0208'],
    'Этаж динозавров':                 ['R–0221', 'R–0610', 'R–0613'],
    'Море ящеров':                     ['R–0218', 'R–0212', 'R–0211'],
    'Первые глаза планеты':            ['R–0217', 'R–0209', 'R–0219'],
    # Докембрий: предметов этого возраста у дома нет — строку находок убираем
    'Тишина до жизни':                 [],
    'Здесь камень ещё жидкий':         ['R–0101', 'R–0104', 'R–0105'],
}


def catalog():
    js = (
        "global.window={};"
        f"eval(require('fs').readFileSync({json.dumps(os.path.join(ROOT,'shared','catalog.js'))},'utf8'));"
        "process.stdout.write(JSON.stringify(window.RELICTUM_CATALOG));"
    )
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    return {o['id']: o for o in json.loads(out)}


def find_link(o):
    return (
        f'<a class="find" href="{o["href"]}">'
        f'<img src="../shared/img/{o["img"]}.jpg?v=12" alt="" loading="lazy" decoding="async">'
        f'{o["name"]}</a>'
    )


def main():
    by_id = catalog()
    s = open(PAGE, encoding='utf-8').read()
    report = []

    def fix_layer(m):
        blk = m.group(0)
        h = re.search(r'<h2>(.*?)</h2>', blk, re.S)
        if not h:
            return blk
        title = re.sub(r'<[^>]+>', ' ', h.group(1))
        title = re.sub(r'\s+', ' ', title).strip()
        ids = LAYERS.get(title)
        if ids is None:
            report.append(f'  ⚠ слой не описан в скрипте: «{title}»')
            return blk
        items = [by_id[i] for i in ids if i in by_id]

        # строка находок
        finds_block = re.search(r'(<div class="finds">)(.*?)(</div>)', blk, re.S)
        if finds_block:
            if items:
                inner = '\n      ' + '\n      '.join(find_link(o) for o in items) + '\n    '
                blk = blk.replace(finds_block.group(0),
                                  finds_block.group(1) + inner + finds_block.group(3), 1)
            else:
                # находок нет — убираем всю строку вместе с подписью над ней
                blk = re.sub(r'\n\s*<div class="finds-label">.*?</div>', '', blk, flags=re.S)
                blk = blk.replace(finds_block.group(0), '', 1)

        # декоративные плашки — фото реального предмета, а не выдуманного
        floats = re.findall(r'<div class="float"[^>]*>\s*<img src="[^"]*"', blk)
        for i, fl in enumerate(floats):
            if i >= len(items):
                continue
            old_src = re.search(r'src="([^"]*)"', fl).group(1)
            blk = blk.replace(fl, fl.replace(old_src, f'../shared/img/{items[i]["img"]}.jpg?v=12'), 1)

        report.append(f'  {title}: находок {len(items)}, плашек {min(len(floats), len(items))}')
        return blk

    s = re.sub(r'<section class="layer[^"]*"[^>]*>.*?</section>', fix_layer, s, flags=re.S)
    open(PAGE, 'w', encoding='utf-8').write(s)
    print('strata.html:')
    print('\n'.join(report))


if __name__ == '__main__':
    main()
