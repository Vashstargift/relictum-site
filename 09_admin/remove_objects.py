#!/usr/bin/env python3
"""RELICTUM — снимает экспонаты с сайта.

Объект живёт в трёх источниках данных сразу: каталоге витрины, контенте промо
и данных печатного PDF. Плюс у части объектов есть статичная шер-страница.
Руками это не вычистить без следов — скрипт убирает запись из всех трёх файлов
и удаляет шер-страницу.

Что скрипт НЕ трогает: жёстко вшитые упоминания в вёрстке эпох и главной,
маппинги в билдерах (build_strata_page, build_era_pages) и медиафайлы.
Первые два правятся отдельно и осознанно, медиа само выпадет из публичного
среза — build_public_site берёт только то, на что есть ссылки.

Запуск:  python3 09_admin/remove_objects.py R–0210 R–0225 …
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'shared', 'catalog.js')
PROMO = os.path.join(ROOT, '16_product_promos', 'promo-data.js')
PDF_DATA = os.path.join(ROOT, '07_product_presentations', 'catalog_data.js')


def ids_in_catalog():
    js = ("global.window={};"
          f"eval(require('fs').readFileSync({json.dumps(CATALOG)},'utf8'));"
          "process.stdout.write(JSON.stringify(window.RELICTUM_CATALOG.map(o=>[o.id,o.name,o.href])));")
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def cut_block(src, cut_from, brace, opener='{', closer='}'):
    """Вырезает запись [cut_from … парная закрывающая скобка] вместе с запятой.

    `brace` — позиция открывающей скобки записи. Её нельзя искать назад от
    совпадения: у промо-данных ключ идёт ДО скобки (`"R–0609": {`), и поиск
    назад уезжает в предыдущую запись, разрезая её пополам.
    """
    i = cut_from
    depth, j, in_str, esc = 0, brace, None, False
    while j < len(src):
        ch = src[j]
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == in_str:
                in_str = None
        elif ch in '"\'':
            in_str = ch
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                j += 1
                break
        j += 1
    # съедаем хвостовую запятую и пустые строки за блоком
    k = j
    while k < len(src) and src[k] in ' \t':
        k += 1
    if k < len(src) and src[k] == ',':
        k += 1
    while k < len(src) and src[k] in '\r\n':
        k += 1
        break
    # и ведущий отступ перед блоком
    while i > 0 and src[i - 1] in ' \t':
        i -= 1
    return src[:i] + src[k:]


def drop(path, rid, pattern, brace_after=False):
    """brace_after=True — открывающая скобка записи входит в совпадение (промо-данные),
    иначе запись открылась раньше и скобку ищем назад (каталог, данные PDF)."""
    src = open(path, encoding='utf-8').read()
    m = re.search(pattern.replace('{ID}', re.escape(rid)), src)
    if not m:
        return False
    if brace_after:
        cut_from, brace = m.start(), src.index('{', m.start())
    else:
        brace = src.rfind('{', 0, m.start())
        cut_from = brace
    src = cut_block(src, cut_from, brace)
    open(path, 'w', encoding='utf-8').write(src)
    return True


def main():
    targets = sys.argv[1:]
    if not targets:
        sys.exit('укажи id: python3 09_admin/remove_objects.py R–0210 …')

    before = ids_in_catalog()
    known = {i for i, _, _ in before}
    unknown = [t for t in targets if t not in known]
    if unknown:
        sys.exit(f'нет в каталоге: {unknown}')

    for rid in targets:
        name = next(n for i, n, _ in before if i == rid)
        href = next(h for i, _, h in before if i == rid)
        print(f'\n{rid} — {name}')

        print('  каталог витрины :', 'убран' if drop(CATALOG, rid, r'"id":\s*"{ID}"') else '⚠ не найден')
        print('  контент промо   :', 'убран' if drop(PROMO, rid, r'"{ID}"\s*:\s*\{', True) else '— записи не было')
        print('  данные PDF      :', 'убран' if drop(PDF_DATA, rid, r"id:\s*'{ID}'") else '— записи не было')

        # статичная шер-страница, если объект её имел
        if href and 'exhibit.html?' not in href:
            page = os.path.join(ROOT, '16_product_promos', os.path.basename(href))
            if os.path.exists(page):
                os.remove(page)
                print('  шер-страница    : удалена', os.path.basename(page))

    after = ids_in_catalog()
    print(f'\nобъектов в каталоге: {len(before)} → {len(after)}')
    left = [t for t in targets if t in {i for i, _, _ in after}]
    if left:
        sys.exit(f'⚠ остались в каталоге: {left}')


if __name__ == '__main__':
    main()
