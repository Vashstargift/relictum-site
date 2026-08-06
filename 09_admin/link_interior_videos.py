#!/usr/bin/env python3
"""RELICTUM — прописывает интерьерные видео в данные промо-страниц.

Ролики лежат в `shared/img/intv_<slug>.mp4`, но страница показывает видео только
если у объекта в `16_product_promos/promo-data.js` в блоке `interior` есть поле
`video`. Скрипт проходит по каталогу и добавляет это поле там, где файл реально
существует, а поля ещё нет. Имя ролика выводится из интерьерного фото:
`int_ph_seymchan.jpg` → `intv_seymchan.mp4`.

Ничего не удаляет и не перезаписывает уже прописанные видео.

Запуск:  python3 09_admin/link_interior_videos.py
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMO = os.path.join(ROOT, '16_product_promos', 'promo-data.js')
IMG = os.path.join(ROOT, 'shared', 'img')


def promo_data():
    js = (
        "global.window={};"
        f"eval(require('fs').readFileSync({json.dumps(PROMO)},'utf8'));"
        "process.stdout.write(JSON.stringify(window.RELICTUM_PROMO));"
    )
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    data = promo_data()
    src = open(PROMO, encoding='utf-8').read()

    added, skipped, missing = [], [], []
    for rid, rec in data.items():
        interior = rec.get('interior') or {}
        if interior.get('video'):
            skipped.append(rid)
            continue
        img = interior.get('img')
        if not img:
            missing.append((rid, 'нет интерьерного фото'))
            continue
        slug = re.sub(r'^int_ph_', '', img).rsplit('.', 1)[0]
        video = f'intv_{slug}.mp4'
        if not os.path.exists(os.path.join(IMG, video)):
            missing.append((rid, f'нет файла {video}'))
            continue

        # вставляем video первым полем блока interior именно этого объекта
        m = re.search(re.escape(f'"{rid}"') + r'\s*:\s*\{', src)
        if not m:
            missing.append((rid, 'запись не найдена в файле'))
            continue
        block = re.search(r'interior:\s*\{', src[m.end():])
        if not block:
            missing.append((rid, 'блок interior не найден'))
            continue
        pos = m.end() + block.end()
        src = src[:pos] + f' video: "{video}",' + src[pos:]
        added.append((rid, video))

    open(PROMO, 'w', encoding='utf-8').write(src)

    print(f'добавлено видео: {len(added)}')
    for rid, v in added:
        print(f'   {rid}  {v}')
    if skipped:
        print(f'уже было: {len(skipped)}')
    if missing:
        print(f'пропущено: {len(missing)}')
        for rid, why in missing:
            print(f'   {rid}  — {why}')


if __name__ == '__main__':
    main()
