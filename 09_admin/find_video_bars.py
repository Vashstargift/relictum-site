#!/usr/bin/env python3
"""RELICTUM — ищет боковые и верхние поля, вшитые в видеофайлы.

Зачем отдельный инструмент: штатный `ffmpeg cropdetect` считает чёрным только
то, что темнее порога 24. Модели отдают поля не чистым чёрным, а тёмно-серым
(яркость 30–40), и cropdetect такие ролики пропускает — именно так поля
пережили прошлую чистку.

Здесь поле ищется по контрасту: у края берётся самый резкий перепад яркости
между тёмной кромкой и началом сцены. Ролик, снятый в чёрной студии, тоже
тёмный по краям, но перепада у него нет — он остаётся нетронутым.

Запуск:  python3 09_admin/find_video_bars.py [файл ...]
         без аргументов — все ролики в shared/img
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'shared', 'img')

DARK_MAX = 62.0     # поле в среднем темнее этого
STEP_MIN = 34.0     # перепад яркости на границе поля и сцены
MIN_BAR = 6         # уже — это кромка кодека, не поле
MAX_FRAC = 0.26     # шире четверти кадра поле не бывает
SAMPLES = (0.15, 0.4, 0.65, 0.9)   # доли длительности, по которым берём кадры


def duration(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def frames(path):
    d = duration(path) or 1.0
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, frac in enumerate(SAMPLES):
            f = os.path.join(tmp, f'{i}.png')
            subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(round(d * frac, 2)),
                            '-i', path, '-frames:v', '1', f],
                           capture_output=True)
            if os.path.exists(f):
                out.append(np.asarray(Image.open(f).convert('L')).astype(float))
    return out


def bar_width(line, reverse=False):
    """Ширина поля у края: ищем положение самого резкого перепада яркости.

    Поле опознаётся не темнотой, а контрастом с началом сцены: у ролика,
    снятого в чёрной студии, края тоже тёмные, но перепада нет — и он
    правильно остаётся нетронутым.
    """
    v = line[::-1] if reverse else line
    n = len(v)
    best, best_step = 0, 0.0
    for k in range(MIN_BAR, int(n * MAX_FRAC)):
        outer = v[:k].mean()
        if outer > DARK_MAX:
            break
        inner = v[k:k + 40].mean()
        step = inner - outer
        if step > best_step:
            best_step, best = step, k
    return best if best_step >= STEP_MIN else 0


def analyse(path):
    fr = frames(path)
    if not fr:
        return None
    lefts, rights, tops, bottoms = [], [], [], []
    for a in fr:
        cm, rm = a.mean(axis=0), a.mean(axis=1)
        lefts.append(bar_width(cm))
        rights.append(bar_width(cm, reverse=True))
        tops.append(bar_width(rm))
        bottoms.append(bar_width(rm, reverse=True))
    # берём минимум по кадрам: поле есть на всех кадрах, блик сцены — нет
    h, w = fr[0].shape
    return {'w': w, 'h': h, 'left': min(lefts), 'right': min(rights),
            'top': min(tops), 'bottom': min(bottoms)}


def main():
    files = sys.argv[1:] or sorted(
        os.path.join(IMG, f) for f in os.listdir(IMG) if f.endswith('.mp4'))
    hits = []
    for p in files:
        r = analyse(p)
        if not r:
            print(f'  ? не прочитан: {os.path.basename(p)}')
            continue
        if r['left'] or r['right'] or r['top'] or r['bottom']:
            hits.append((p, r))
            print(f"  ⚠ {os.path.basename(p):<34} {r['w']}×{r['h']}  "
                  f"слева {r['left']}, справа {r['right']}, "
                  f"сверху {r['top']}, снизу {r['bottom']}")
    print(f'\nпроверено роликов: {len(files)}, с полями: {len(hits)}')
    return hits


if __name__ == '__main__':
    main()
