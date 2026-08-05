# RELICTUM — хостинг на Beget (relictum.gallery)

Сайт статический: ни бэкенда, ни базы, ни сборки фронтенда. Публикуется как папка файлов.
Аккаунт тот же, что у StarGift и GASP: `stargift@stargift.beget.tech`, ключ `~/.ssh/id_ed25519`.

---

## 1. Состояние на 05.08.2026

Сделано в панели Beget:

- домен `relictum.gallery` добавлен в аккаунт `stargift`, сайт создан и привязан
  к `~/relictum.gallery/public_html/`;
- срез залит (431 файл, 257 МБ), заглушка Beget отложена как `beget-parking.php.bak`;
- проверено по IP с подменой Host: файлы отдаются, `.htaccess` работает.

**IP аккаунта: `5.101.153.53`.** Зона домена на DNS Beget уже создана и указывает на него.

Осталось:

1. **NS у регистратора.** Домен зарегистрирован в **RU-CENTER (nic.ru)**, там стоят
   `ns3/ns4/ns8.nic.ru`. Нужно заменить их на `ns1.beget.com` и `ns2.beget.com`.
   Альтернатива без делегирования — оставить DNS в nic.ru и прописать A-записи
   `@` и `www` на `5.101.153.53`; но тогда почту на домене придётся вести тоже в nic.ru.
2. **SSL** — бесплатный Let's Encrypt в панели Beget, включается после того, как DNS разойдётся
   (обычно пара часов). В `.htaccess` путь `/.well-known/` намеренно исключён из редиректа
   на https — иначе проверка Let's Encrypt не пройдёт (проверено: файл по этому пути отдаётся 200).
3. **Почта** `hello@relictum.gallery` — кнопки «Запросить объект» на промо-страницах ведут
   в `mailto:`, ящик должен существовать. Пароль ящика задаёт владелец.

Проверить, что папка появилась:

```bash
ssh -i ~/.ssh/id_ed25519 stargift@stargift.beget.tech "ls -d ~/relictum.gallery/public_html/"
```

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
