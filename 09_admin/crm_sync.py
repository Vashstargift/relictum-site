#!/usr/bin/env python3
"""RELICTUM ↔ CRM StarGift — синхронизация данных коллекции.

Источник правды с 07.09.2026 — таблица relictum_items в MySQL StarGift
(вкладка «Relictum» в CRM). Файлы shared/catalog.js и 16_product_promos/promo-data.js
в репозитории — генерируемые копии для сборки среза и GitHub Pages.

  python3 09_admin/crm_sync.py push     # локальные файлы → база (upsert; первичная миграция и правки конвейера Claude)
  python3 09_admin/crm_sync.py pull     # база → локальные файлы (перед сборкой/коммитом)
  python3 09_admin/crm_sync.py publish  # база → relictum.gallery (то же, что кнопка в CRM)

Ключ бота берётся с сервера по ssh (DOC_BOT_KEY из ~/stargift.ru/.env) — локально не хранится.
"""
import json, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://stargift.ru/api/'
SSH = ['ssh', '-i', os.path.expanduser('~/.ssh/id_ed25519'), 'stargift@stargift.beget.tech']

def bot_key():
    """Ключ бота: сначала связка ключей macOS (relictum-bot-key), иначе — с сервера по ssh и в связку.
    SSH к Beget бывает недоступен (10.09.2026 лежал 20 минут) — кэш спасает публикацию."""
    kc = subprocess.run(['security', 'find-generic-password', '-s', 'relictum-bot-key', '-w'], capture_output=True, text=True)
    if kc.returncode == 0 and kc.stdout.strip(): return kc.stdout.strip()
    out = subprocess.run(SSH + ["grep -E '^(DOC_BOT_KEY|CRM_BOT_KEY)=' ~/stargift.ru/.env | head -1 | cut -d= -f2-"],
                         capture_output=True, text=True, check=True).stdout.strip().strip('"\'')
    if not out: sys.exit('бот-ключ не найден в ~/stargift.ru/.env')
    subprocess.run(['security', 'add-generic-password', '-U', '-a', 'docbrown', '-s', 'relictum-bot-key', '-w', out], capture_output=True)
    return out

def call(endpoint, method='GET', data=None, key=None):
    req = urllib.request.Request(API + endpoint, method=method,
                                 data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json', 'X-Bot-Key': key or bot_key()})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode())

def load_local():
    js = ("global.window={};"
          f"require({json.dumps(os.path.join(ROOT,'shared','catalog.js'))});"
          f"require({json.dumps(os.path.join(ROOT,'16_product_promos','promo-data.js'))});"
          "process.stdout.write(JSON.stringify({catalog:window.RELICTUM_CATALOG,promo:window.RELICTUM_PROMO}));")
    return json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)

def cmd_push():
    d = load_local()
    r = call('relictum-sync.php', 'POST', {'catalog': d['catalog'], 'promo': d['promo'], 'mode': 'upsert'})
    print('push:', r)

def cmd_pull():
    r = call('relictum-sync.php?format=repo')
    open(os.path.join(ROOT, 'shared', 'catalog.js'), 'w', encoding='utf-8').write(r['catalog_js'])
    open(os.path.join(ROOT, '16_product_promos', 'promo-data.js'), 'w', encoding='utf-8').write(r['promo_js'])
    print(f"pull: объектов {r['total']}, видимых {r['visible']} → catalog.js, promo-data.js")

def cmd_publish():
    r = call('relictum-publish.php', 'POST', {})
    print('publish:', r)

if __name__ == '__main__':
    {'push': cmd_push, 'pull': cmd_pull, 'publish': cmd_publish}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
