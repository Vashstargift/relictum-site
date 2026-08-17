#!/usr/bin/env python3
"""RELICTUM — добавление экспонатов в каталог и промо из спецификации.

Экспонаты приходят пачками из таблицы наличия, и каждый раз это одни и те же
две правки: запись в shared/catalog.js (карточка витрины) и запись в
16_product_promos/promo-data.js (страница экспоната). Руками их не пишем —
здесь спецификация в JSON превращается в обе записи разом, с одинаковыми
полями и без опечаток в длинном тире шифра.

Запуск:  python3 09_admin/add_exhibits.py <spec.json>

Формат спецификации — список объектов:
  {
    "id": "R–0275",                  # шифр с ДЛИННЫМ тире
    "slug": "0275-cave-bear-skull",
    "name": "Череп пещерного медведя",
    "latin": "Ursus spelaeus",
    "world": "grand", "category": "Мамонтовая фауна",
    "period": "Плейстоцен", "era": "Кайнозой", "region": "Россия",
    "age": "…", "location": "…", "size": "…", "mount": "…",
    "price": 2500000,                # число или null («Цена по запросу»)
    "status": "в наличии",           # необязательно
    "img": "ph_cavebear_skull",
    "description": "…",              # для карточки витрины
    "hook": "…", "heroKicker": "…",
    "story": ["…", "…"],
    "life": {"title": "…", "text": "…"},        # необязательно
    "alive": {"title": "…", "text": "…"},       # необязательно (метеориты)
    "interior": "…",                            # текст блока «В интерьере»
    "seo": {"title": "…", "description": "…"}
  }
Медиа берутся по img: ph_<x>, anat_<x>, life_<x>, int_ph_<x> — файлы должны
уже лежать в shared/img.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'shared', 'catalog.js')
PROMO = os.path.join(ROOT, '16_product_promos', 'promo-data.js')

WORLD_LABEL = {'vita': 'Жизнь', 'grand': 'Монументы', 'terra': 'Земля', 'cosmos': 'Космос'}


def money(v):
    return f'{v:,}'.replace(',', ' ') + ' ₽'


def catalog_entry(s):
    stem = s['img'][3:] if s['img'].startswith('ph_') else s['img']
    e = {
        'id': s['id'],
        'world': s['world'],
        'worldLabel': WORLD_LABEL[s['world']],
        'category': s['category'],
        'period': s['period'],
        'era': s['era'],
        'region': s.get('region', ''),
        'latin': s.get('latin', ''),
        'name': s['name'],
        'meta': s.get('meta', f"{s.get('region','')}, {s.get('age','')}").strip(', '),
        'price': money(s['price']) if s.get('price') else 'Цена по запросу',
        'img': s['img'],
        'priceValue': s.get('price') or None,
        'slug': s['slug'],
        'age': s.get('age', 'По запросу'),
        'location': s.get('location', 'По запросу'),
        'size': s.get('size', 'По запросу'),
        'mount': s.get('mount', 'Оформление по запросу клиента'),
        'description': s['description'],
        'href': f"../16_product_promos/exhibit.html?id={s['slug']}",
    }
    if s.get('found'):
        e['found'] = s['found']
    if s.get('status'):
        e['status'] = s['status']
    e['_stem'] = stem
    return e


def promo_entry(s):
    stem = s['img'][3:] if s['img'].startswith('ph_') else s['img']
    p = {'seo': s['seo'], 'hook': s['hook'], 'heroKicker': s['heroKicker'], 'story': s['story']}
    if s.get('era_block'):
        p['era'] = s['era_block']
    if s.get('life'):
        p['life'] = {'img': f'life_{stem}.jpg', 'diagram': f'anat_{stem}.jpg',
                     'label': 'При жизни', 'stateLabel': 'При жизни',
                     'title': s['life']['title'], 'text': s['life']['text']}
    if s.get('alive'):
        p['alive'] = dict(s['alive'], poster=f"{s['img']}.jpg")
    p['interior'] = {'img': f'int_ph_{stem}.jpg', 'text': s['interior']}
    p['gallery'] = []
    return p


def js_block(obj, indent):
    """JSON с отступами репозитория; ключи в кавычках — как в catalog.js."""
    text = json.dumps(obj, ensure_ascii=False, indent=2)
    pad = ' ' * indent
    return '\n'.join(pad + ln for ln in text.split('\n')).lstrip()


def add(spec_path):
    spec = json.load(open(spec_path, encoding='utf-8'))
    cat = open(CATALOG, encoding='utf-8').read()
    promo = open(PROMO, encoding='utf-8').read()

    added = []
    for s in spec:
        if f'"{s["id"]}"' in cat:
            print(f'   {s["id"]} уже в каталоге — пропуск')
            continue
        stem = s['img'][3:] if s['img'].startswith('ph_') else s['img']
        missing = [f for f in [f'{s["img"]}.jpg', f'int_ph_{stem}.jpg']
                   + ([f'life_{stem}.jpg', f'anat_{stem}.jpg'] if s.get('life') else [])
                   if not os.path.exists(os.path.join(ROOT, 'shared', 'img', f))]
        if missing:
            print(f'   {s["id"]} — нет медиа: {", ".join(missing)}; пропуск')
            continue

        e = catalog_entry(s)
        e.pop('_stem')
        cat = cat.rstrip()
        assert cat.endswith('];'), 'неожиданный хвост catalog.js'
        cat = cat[:-2].rstrip().rstrip(',') + ',\n  ' + js_block(e, 2) + '\n];\n'

        p = promo_entry(s)
        promo = promo.rstrip()
        assert promo.endswith('};'), 'неожиданный хвост promo-data.js'
        body = js_block(p, 2)
        promo = promo[:-2].rstrip().rstrip(',') + f',\n\n  "{s["id"]}": ' + body + '\n};\n'
        added.append(s['id'] + ' ' + s['name'])

    open(CATALOG, 'w', encoding='utf-8').write(cat)
    open(PROMO, 'w', encoding='utf-8').write(promo)
    print(f'добавлено: {len(added)}')
    for a in added:
        print('  +', a)


if __name__ == '__main__':
    add(sys.argv[1])
