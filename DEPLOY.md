# RELICTUM — хостинг на Beget (relictum.gallery)

Сайт статический: ни бэкенда, ни базы, ни сборки фронтенда. Публикуется как папка файлов.
Аккаунт тот же, что у StarGift и GASP: `stargift@stargift.beget.tech`, ключ `~/.ssh/id_ed25519`.

---

## 1. Состояние на 05.08.2026 — домен работает

Сделано полностью:

- домен `relictum.gallery` добавлен в аккаунт `stargift`, сайт создан и привязан
  к `~/relictum.gallery/public_html/`, заглушка Beget отложена как `beget-parking.php.bak`;
- NS у регистратора (RU-CENTER) переключены на `ns1.beget.com` / `ns2.beget.com`, реестр `.gallery`
  делегирование принял, публичные резолверы разошлись;
- **SSL Let's Encrypt выпущен 05.08.2026, действует до 03.11.2026**, продление автоматическое;
- в `.htaccess` включён форс-редирект на https (`FORCE_HTTPS = True` в сборщике). Путь
  `/.well-known/` из редиректа исключён — иначе продление сертификата упрётся в 301.
  Проверено после включения: файл по этому пути отдаётся по http с кодом 200.

### Про IP — почему делегирование оказалось правильным решением

Адрес домена менялся дважды за день, и Beget вёл его сам:

| Когда | A-запись | Что это |
|---|---|---|
| до привязки | `178.210.92.188` | парковка регистратора |
| после привязки к аккаунту | `5.101.153.53` | сервер аккаунта, `m2.chase.beget.com` |
| после выпуска SSL | `87.236.16.28` | фронт Beget с терминацией TLS |

Соседние домены (stargift.ru, gaspdiamonds.com) сделаны иначе — жёсткой A-записью на
`45.130.40.111` в DNS RU-CENTER. Будь relictum.gallery сделан так же, сайт слёг бы дважды:
при переезде на сервер аккаунта и при выпуске сертификата. **Новые домены заводить
делегированием на NS Beget, а не A-записью.**

⚠️ Отдельно: у stargift.ru и gaspdiamonds.com A-запись указывает на `45.130.40.111`, тогда как
аккаунт живёт на `5.101.153.53`. Оба адреса пока отвечают, но стоит спросить поддержку Beget,
не выводится ли старый — иначе однажды оба сайта отвалятся без предупреждения.

---

## 2. Сборка публичного среза

Рабочий репозиторий содержит и то, что покупателю показывать не нужно: админку `09_admin`,
стратегию, презентации, брендбук, черновые версии сайта. На домен уезжает только витрина —
её собирает скрипт:

```bash
cd ~/relictum-vashikmart && python3 09_admin/build_public_site.py
```

Что он делает:

| Из репозитория | На домене |
|---|---|
| `02_site_v1_gallery/*.html` | корень: `/`, `/catalog.html`, `/journal.html` … |
| `16_product_promos/` | `/objects/` |
| `15_concepts/` | `/eras/` |
| `14_provenance/` | `/provenance/` |
| `shared/` | `/shared/` (медиа, стили, данные) |

Плюс переписывает относительные ссылки под новую раскладку, проставляет каждой странице
канонический адрес и OG на `relictum.gallery`, генерирует `robots.txt`, `sitemap.xml`,
`.htaccess` (https, без www, gzip, кэш) и страницу 404.

Результат — `public/` (~255 МБ, в `.gitignore`). **Руками в `public/` не править** — перезапишется.

---

## 3. Проверка перед заливкой

```bash
# битые ссылки в разметке
cd ~/relictum-vashikmart/public && python3 - <<'PY'
import os,re
pat=re.compile(r'(?:href|src)="([^"]+)"'); script=re.compile(r'<script\b.*?</script>', re.S)
bad=0
for dp,_,fs in os.walk('.'):
    for f in fs:
        if not f.endswith('.html'): continue
        p=os.path.join(dp,f); t=script.sub('', open(p,encoding='utf-8').read())
        for m in pat.findall(t):
            if m.startswith(('http','mailto:','tel:','#','data:','javascript:')) or "'" in m or '${' in m: continue
            l=m.split('#')[0].split('?')[0]
            if not l: continue
            tg=os.path.normpath(os.path.join('.', l.lstrip('/'))) if l.startswith('/') else os.path.normpath(os.path.join(os.path.dirname(p), l))
            if not os.path.exists(tg): print('❌',p,'→',m); bad+=1
print('битых ссылок:', bad or 'нет')
PY

# и посмотреть глазами
cd ~/relictum-vashikmart/public && python3 -m http.server 8123
```

---

## 4. Заливка

**Бэкап до заливки — обязательно. rsync БЕЗ `--delete`.**

```bash
# бэкап того, что уже лежит на сервере (со второго раза и далее)
ssh -i ~/.ssh/id_ed25519 stargift@stargift.beget.tech \
  "cp -a ~/relictum.gallery/public_html ~/relictum-backup-$(date +%Y%m%d-%H%M%S)"

# первая полная заливка (~255 МБ, идёт долго; последующие — только изменённое)
rsync -rlzc -e "ssh -i ~/.ssh/id_ed25519" \
  ~/relictum-vashikmart/public/ \
  stargift@stargift.beget.tech:~/relictum.gallery/public_html/

# проверка
curl -s -o /dev/null -w "%{http_code}\n" https://relictum.gallery/
curl -s -o /dev/null -w "%{http_code}\n" https://relictum.gallery/catalog.html
```

---

## 5. Грабли

- **Кэш Beget — 30 дней на статику.** Перезаписали картинку под тем же именем — инкрементьте
  cache-buster `?v=N` во всех рендерах (сейчас `v=10`), иначе у посетителей останется старая.
- **`.htaccess` едет вместе со срезом** — rsync его переносит, отдельной заливки не нужно.
- **Страницы объектов рисуются на клиенте** (`/objects/exhibit.html?id=…`), поэтому title и OG
  у них общие. Для отдельных объектов делаются статичные шер-страницы — их сейчас 8.
- **GitHub Pages остаётся живым** и содержит админку и внутренние материалы. После переезда
  репозиторий стоит закрыть либо повесить редирект — иначе в поиске будут две копии сайта.
