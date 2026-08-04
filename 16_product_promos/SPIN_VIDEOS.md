# 360°-видео экспонатов (spin)

Секция «Объект в 360°» на промо-страницах берёт видео из поля `spin` в `promo-data.js`.
Сгенерированы kling3_0_turbo (Higgsfield) из канонических ivory-фото `ph_*.jpg`, 9:16, 5 сек.

⚠️ Сейчас в `promo-data.js` прописаны прямые ссылки на CDN Higgsfield (облачная сессия
не могла скачать mp4 из-за сетевой политики). Работают, но лучше локализовать.

## Локализация (выполнить на Маке одной командой)

```bash
cd <корень проекта>
grep -oE 'spin: "https[^"]+"' 16_product_promos/promo-data.js | sed 's/spin: "//;s/"//' | paste -d' ' <(printf 'spin_tusks\nspin_rhino\nspin_jeholo\nspin_sabertooth\nspin_bothrio\nspin_dronino\nspin_chinge\nspin_moon\n') - | while read name url; do curl -sf -o "shared/img/$name.mp4" "$url" && echo "OK $name"; done
```

Затем в `promo-data.js` заменить каждую ссылку на имя файла:
`spin: "spin_tusks.mp4"` и т.д. (шаблон страниц понимает оба формата: URL и имя файла
в shared/img), задеплоить mp4 + promo-data.js.

## Соответствие

| ID | Экспонат | Файл после локализации |
|----|----------|------------------------|
| R–0607 | Пара бивней мамонта | spin_tusks.mp4 |
| R–0608 | Череп шерстистого носорога | spin_rhino.mp4 |
| R–0609 | Jeholosaurus | spin_jeholo.mp4 |
| R–0208 | Череп саблезубой кошки | spin_sabertooth.mp4 |
| R–0209 | Bothriolepis | spin_bothrio.mp4 |
| R–0103 | Метеорит Дронино | spin_dronino.mp4 |
| R–0104 | Метеорит Чинге | spin_chinge.mp4 |
| R–0105 | Лунный метеорит в раме | spin_moon.mp4 (плавный наезд, не орбита) |

---

## Задание для облачной сессии (сформировано 04.08.2026)

Higgsfield MCP авторизован **только в облачной сессии** Claude Code (на Маке OAuth не
завершён и локального токена нет). Поэтому 360°-видео делаем там; локально — только
фото через `nano-banana` (Gemini) и вёрстка.

**Рецепт (проверен, из CLAUDE.md):** `kling3_0_turbo` image-to-video, `start_image` —
каноническое ivory-фото `shared/img/ph_<slug>.jpg` (или `job_id` предыдущей генерации),
duration 5. Промпт:

> Slow cinematic 360-degree turntable orbit around this exact museum specimen. The object
> stays perfectly centered and unchanged, warm ivory studio background, soft diffused
> lighting. No zoom, no morphing, no text.

⚠️ kling предлагает пресет «IN THE DARK» — ретраить с `declined_preset_id`.
⚠️ veo3 без `start_image` не работает.

**Скачивание результата:** `job_display(id)` → `results.rawUrl` → curl → в `shared/img/`
под именем `spin_<короткий-слаг>.mp4`, затем прописать `spin: "spin_<...>.mp4"` в
соответствующий блок `promo-data.js`. Если сеть облака режет CDN — оставить прямой URL
в поле `spin` (шаблон понимает оба формата) и локализовать позже на Маке по инструкции выше.

### Приоритет 1 — крупные экспонаты со свежим каноном (04.08)

| ID | Экспонат | start_image |
|----|----------|-------------|
| R–0219 | Череп Dunkleosteus | ph_dunkleosteus.jpg |
| R–0221 | Коготь крупного теропода | ph_carcharodont_claw.jpg |
| R–0220 | Челюсть спинозавра | ph_spinosaurus_jaw.jpg |
| R–0612 | Скелет крокодилиформа | ph_crocodyliform.jpg |
| R–0613 | Скелет пинакозавра | ph_pinacosaurus.jpg *(spin уже есть — пропустить)* |
| R–0614 | Скелет овираптора | ph_oviraptor.jpg |
| R–0226 | Череп динокрокуты | ph_hyena_skull.jpg |

### Приоритет 2 — остальные без spin

R–0210 аммолит · R–0211 Arietites · R–0212 кейхозавр · R–0213 череп пситтакозавра ·
R–0214 анхиорнис · R–0215 яйца динозавра · R–0217 трилобит · R–0218 ихтиозавр-плита ·
R–0222 птерозавр-плита · R–0223 Afrovenator · R–0610 скелет пситтакозавра ·
R–0611 скелет носорога · R–0224 полированные аммониты · R–0225 череп пещерного льва ·
R–0615 зубр · R–0616 волк · R–0617 мамонт

*Плиты (R–0218, R–0222) — не орбита, а медленный наезд/панорама вдоль плиты:
объект плоский, вращение выглядит неестественно (ср. лунный метеорит R–0105).*
