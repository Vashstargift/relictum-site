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
