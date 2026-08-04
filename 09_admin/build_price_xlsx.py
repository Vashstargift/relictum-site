#!/usr/bin/env python3
"""RELICTUM — сборка внутренней Excel-таблицы коллекции с ценами.

ПУБЛИЧНАЯ ВЕРСИЯ: только продажные цены. Закупочные (себестоимость) — в приватном репо.
Источники: shared/catalog.js (состав каталога сайта) + данные партнёра Михаила
(старый PDF-каталог 26 слайдов + архив «Реликтум_для_сайта»).

Запуск: python3 09_admin/build_price_xlsx.py
Выход:  09_admin/RELICTUM_коллекция_цены.xlsx  (в .gitignore деплой-репо не попадает)
"""
import json, re, subprocess, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── состав каталога сайта ─────────────────────────────────────────────
js = subprocess.run(
    ['node', '-e', 'global.window={};require("./shared/catalog.js");console.log(JSON.stringify(window.RELICTUM_CATALOG))'],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout
CAT = json.loads(js)

# ── цены партнёра (внутренние). None = не назначено/уточняется ────────
# формат: id -> (входная, продажная, валюта, статус/примечание)
PRICES = {
  # ПУБЛИЧНАЯ ВЕРСИЯ: закупочная цена (себестоимость) НЕ включена — она есть
  # только в приватном репозитории владельца. Здесь — продажные цены.
  # Формат: 'R–XXXX': (входная=None, продажная, валюта, 'примечание/статус')
  'R–0605': (None, 60000, 'USD', 'череп мамонта с бивнями'),
  'R–0604': (None, 85000, 'USD', 'скелет пещерного медведя'),
  'R–0607': (None, 135000, 'USD', 'пара бивней мамонта'),
  'R–0608': (None, 250000, 'USD', 'носорог: цена указана за полный скелет'),
  'R–0611': (None, 250000, 'USD', 'полный скелет шерстистого носорога'),
  'R–0609': (None, 60000, 'USD', 'плита Jeholosaurus'),
  'R–0610': (None, 100000, 'USD', 'скелет пситтакозавра, комплектность >95 %'),
  'R–0613': (None, None, 'USD', 'пинакозавр: продажная — УТОЧНИТЬ у Михаила'),
  'R–0614': (None, 210000, 'EUR', 'овираптор'),
  'R–0615': (None, 80000, 'USD?', 'зубр: валюта — УТОЧНИТЬ'),
  'R–0616': (None, 60000, 'USD?', 'волк: валюта — УТОЧНИТЬ'),
  'R–0617': (None, 25000000, 'RUB', 'скелет мамонта'),
  'R–0225': (None, None, 'USD', 'череп льва №1: продажная — УТОЧНИТЬ'),
  'R–0226': (None, None, None, 'череп гиены: цена и описание — ОЖИДАЕМ от Михаила'),
  'R–0227': (None, None, 'USD', 'Дронино 128 кг: витрина ~5 $/г → ≈640 тыс. при 128 кг'),
  'R–0218': (None, 50000, 'USD', 'скелет ихтиозавра Mixosaurus'),
  'R–0219': (None, 180000, 'USD', 'череп Dunkleosteus (реконструкция)'),
  'R–0220': (None, 60000, 'USD', 'челюсть спинозавра'),
  'R–0221': (None, 100000, 'USD', 'коготь кархародонтозавра'),
  'R–0222': (None, 90000, 'USD', 'скелет птерозавра'),
  'R–0223': (None, 1500000, 'USD', 'модель черепа Afrovenator: 1,5–2 млн'),
  'R–0212': (None, 9000, 'USD', 'кейхозавр'),
  'R–0213': (None, 21000, 'USD', 'череп пситтакозавра'),
  'R–0214': (None, 85000, 'USD', 'Anchiornis'),
  'R–0215': (None, 12000, 'USD', 'яйца динозавра'),
  'R–0217': (None, 8500, 'USD', 'гигантский трилобит'),
  'R–0211': (None, 15000, 'USD', 'аммонит Arietites'),
  'R–0201': (None, 4500, 'USD', 'зуб мегалодона'),
  'R–0209': (None, 45000, 'USD', 'Bothriolepis'),
  'R–0208': (None, 75000, 'USD', 'саблезубая кошка'),
  'R–0612': (None, 200000, 'USD', 'крокодилиформ'),
  'R–0224': (None, None, 'RUB', 'аммониты: 150–450 ₽ за предмет (7 шт)'),
  'R–0210': (None, None, None, 'аммолит: цена не назначена'),
  'R–0101': (None, None, None, 'Сеймчан: экспедиция в процессе, объём уточняется'),
  'R–0103': (None, None, None, 'Дронино индивидуал: по запросу'),
  'R–0104': (None, None, None, 'Чинге: продажа 7 $/г'),
  'R–0105': (None, None, None, 'лунный метеорит в раме'),

}

PROMO = json.loads(subprocess.run(
    ['node', '-e', 'global.window={};require("./16_product_promos/promo-data.js");console.log(JSON.stringify(Object.keys(window.RELICTUM_PROMO)))'],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)

IVORY='FFF4F0E8'; BRONZE='FF9A6D34'; DARK='FF14110E'
thin=Side(style='thin', color='FFD8C8AF')
border=Border(left=thin,right=thin,top=thin,bottom=thin)

wb=Workbook(); ws=wb.active; ws.title='Коллекция'
cols=['ID','Экспонат','Латынь','Мир','Категория','Период','Регион','Размер',
      'Цена на сайте','Входная','Продажная','Валюта','Маржа','Промо','360°','Примечание / статус']
ws.append(cols)
for c in ws[1]:
    c.font=Font(bold=True,color='FFFFFFFF',size=10); c.fill=PatternFill('solid',fgColor=DARK)
    c.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True); c.border=border

for o in CAT:
    inp,out,cur,note = PRICES.get(o['id'], (None,None,None,''))
    margin = (out-inp) if (isinstance(inp,(int,float)) and isinstance(out,(int,float))) else None
    ws.append([
        o['id'], o['name'], o.get('latin',''), o.get('worldLabel',''), o.get('category',''),
        o.get('period',''), o.get('region',''), o.get('size',''),
        o.get('price',''), inp, out, cur or '', margin,
        'да' if o['id'] in PROMO else '', '', note,
    ])

# 360°-видео
spins={'R–0607','R–0608','R–0609','R–0208','R–0209','R–0103','R–0104','R–0105'}
for row in ws.iter_rows(min_row=2):
    rid=row[0].value
    row[14].value='да' if rid in spins else ''
    for c in row:
        c.border=border; c.alignment=Alignment(vertical='top',wrap_text=True)
        c.font=Font(size=10)
    for i in (9,10,12):
        if row[i].value is not None: row[i].number_format='#,##0'
    if row[0].row % 2 == 0:
        for c in row: c.fill=PatternFill('solid',fgColor=IVORY)

widths=[9,32,26,13,20,14,16,34,18,13,13,9,13,8,7,52]
for i,w in enumerate(widths,1): ws.column_dimensions[get_column_letter(i)].width=w
ws.freeze_panes='A2'; ws.auto_filter.ref=ws.dimensions

# ── лист «Сводка» ─────────────────────────────────────────────────────
s2=wb.create_sheet('Сводка')
known=[(o['id'],)+PRICES.get(o['id'],(None,None,None,'')) for o in CAT]
usd_in=sum(p[1] for p in known if p[3]in('USD','USD?') and isinstance(p[1],(int,float)))
usd_out=sum(p[2] for p in known if p[3]in('USD','USD?') and isinstance(p[2],(int,float)))
eur_in=sum(p[1] for p in known if p[3]=='EUR' and isinstance(p[1],(int,float)))
eur_out=sum(p[2] for p in known if p[3]=='EUR' and isinstance(p[2],(int,float)))
rub_in=sum(p[1] for p in known if p[3]=='RUB' and isinstance(p[1],(int,float)))
rub_out=sum(p[2] for p in known if p[3]=='RUB' and isinstance(p[2],(int,float)))
rows=[
 ['RELICTUM — сводка по коллекции',''],
 ['',''],
 ['Всего экспонатов в каталоге', len(CAT)],
 ['С промо-страницей', sum(1 for o in CAT if o['id'] in PROMO)],
 ['С 360°-видео', len(spins)],
 ['Цена назначена (вход и продажа)', sum(1 for p in known if isinstance(p[1],(int,float)) and isinstance(p[2],(int,float)))],
 ['Требуют уточнения у Михаила', sum(1 for p in known if 'УТОЧНИТЬ' in (p[4] or '') or 'ОЖИДАЕМ' in (p[4] or ''))],
 ['',''],
 ['Сумма входная, USD', usd_in],
 ['Сумма продажная, USD', usd_out],
 ['Потенциал маржи, USD', usd_out-usd_in],
 ['',''],
 ['Сумма входная, EUR', eur_in],
 ['Сумма продажная, EUR', eur_out],
 ['',''],
 ['Сумма входная, RUB', rub_in],
 ['Сумма продажная, RUB', rub_out],
 ['',''],
 ['ПРИМЕЧАНИЕ', 'Публичная версия: закупочные цены не включены. Полная таблица — у владельца.'],
]
for r in rows: s2.append(r)
s2['A1'].font=Font(bold=True,size=14,color=BRONZE)
s2['A19'].font=Font(bold=True,color='FFB00000')
for r in s2.iter_rows(min_row=3,max_row=17,min_col=2,max_col=2):
    for c in r:
        if isinstance(c.value,(int,float)): c.number_format='#,##0'
s2.column_dimensions['A'].width=36; s2.column_dimensions['B'].width=70

out=os.path.join(ROOT,'09_admin','RELICTUM_коллекция_цены.xlsx')
wb.save(out)
print('OK →', out, '| строк:', len(CAT))
