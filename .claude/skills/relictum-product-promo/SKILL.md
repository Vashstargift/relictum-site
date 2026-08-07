---
name: relictum-product-promo
description: Конвейер промо-страниц Relictum — создать промо экспоната или эпохи (генерация медиа через Higgsfield, сборка страницы по шаблону дома, деплой на GitHub Pages). Использовать когда просят сделать промо-страницу экспоната/эпохи, добавить объект «со встретить живым», или продолжить бэклог 16_product_promos/BACKLOG.md.
---

# Relictum · конвейер промо-страниц

Ты собираешь промо-страницу экспоната или эпохи для люкс-бренда Relictum.
Проект: `~/Desktop/RELICTUM/project/`. Живой сайт: https://vashikmart.github.io/relictum/

## Голос бренда (обязательно)
Спокойный, точный, вечный. Латинские имена видов, точные датировки. История прежде цены.
НИКОГДА: «купи», «скидка», восклицательные знаки, эмодзи (макс. одна ◆ или ☄), Jurassic-Park-стиль.
Формула заголовков: факт-образ («Восемнадцать метров голода», «Дуга в 25 000 лет над консолью»).

## Токены
Ivory #F4F0E8 · Bone #FBF8F1 · Black #0A0908 · Bronze #B08A55 · Gold #E9C98A · Deep #8F6530.
Шрифты: Cormorant Garamond (display/italic) + Inter (UI), Google Fonts.
Логотип: ТОЛЬКО `shared/brand/Relictum_lockup_light.png` / `_dark.png` (лок-ап) и
`Relictum_comet.png` (значок). Никаких самодельных комет.

## Структура промо ЭКСПОНАТА (шаблон: 16_product_promos/exhibit.html)
1. **Hero-паспорт**: фото 4:5 слева, справа шифр R–XXXX, имя, латынь, dl-спека
   (эпоха/находка/размер/оправа/документы), цена serif, кнопки «Запросить» + «Увидеть живым ↓».
2. **Провенанс-нить**: 5 точек-этапов (жизнь → залегание → находка → дом Relictum → «Вы»),
   клик раскрывает карточку. JS-паттерн внутри шаблона.
3. **«В вашем доме»**: интерьерный рендер 16:9 + одна строка-продажа + линк на interiors.html.
4. **«Встретить живым»** (тёмная секция): видеофон `era_*.mp4` или фото `beast_*.jpg`
   с медленным Ken-Burns (CSS @keyframes swim), заголовок-факт, кнопка «Войти в эпоху →»
   на `15_concepts/era-*.html`. Это ключевая механика — из экспоната в эпоху.
5. **Сервис-полоса** 3 колонки: Подлинность / Ритуал / Передача.
Данные объектов: `data/catalog.json`; ассортимент-источник: `data/paleohunters_research.json`.

## Структура промо ЭПОХИ (шаблон: 15_concepts/era-cretaceous.html)
Hero-видео эпохи → факт-лента 4 цифры → 2-3 секции существ (портрет beast_* фоном,
чередуй лево/право, binom+заголовок+3 строки+статы) → «Что можно иметь дома» (3 карточки
в каталог) → ссылки на другие эры. У эпохи и экспонатов перекрёстные ссылки.

## Генерация медиа (Higgsfield MCP)
- **Изображения**: `generate_image`, model `nano_banana_pro`, resolution `2k`.
  Портрет существа: «Award-winning wildlife photography, photorealistic: close-up portrait of
  <вид> ... National Geographic realism as if photographed alive, vertical composition.
  No text, no watermark.» aspect 9:16.
  Интерьер: «Ultra-luxury interior photography: <объект> ... quiet luxury, Architectural
  Digest realism. No text, no watermark, no people.» aspect 16:9.
  img2img (пары до/после, УФ, подсветка): medias:[{role:"image", value:"<job_id>"}] +
  «The exact same ... everything else unchanged».
- **Видео**: `generate_video`, model `veo3`, aspect 9:16,
  medias:[{role:"start_image", value:"<job_id картинки>"}]. Если сервис предложит пресет —
  повторить вызов с `declined_preset_id` из ответа. Промпт: медленное почти статичное
  движение, «camera almost static», «documentary realism», «No text».
- **Вырезка фона**: model `image_background_remover`,
  medias:[{role:"image_references", value:"<job_id>"}], prompt ОБЯЗАТЕЛЕН (любой, напр.
  "remove background").
- **Скачивание**: URL берётся из `show_generations` → results.rawUrl
  (`hf_<дата>_<время>_<job_id>.png|mp4`). ВНИМАТЕЛЬНО копируй job_id целиком (UUID 8-4-4-4-12).
  PNG 2K → web: `sips -Z 1600 -s format jpeg -s formatOptions 80 in.png --out shared/img/x.jpg`;
  вырезки PNG: `sips -Z 900` (сохраняет альфу). Оригиналы класть в `05_art/<категория>/`.

## Технические правила страниц
- Один самодостаточный HTML на страницу, стили инлайном в <style>, Google Fonts линком.
- Пути к медиа: `../shared/img/...`, к бренду: `../shared/brand/...`.
- НЕ использовать IntersectionObserver — только scroll-хендлеры (паттерн .rv/chk в шаблонах):
  встроенное превью замораживает IO/rAF/transitions; функциональность проверять через
  preview_eval, визуал — headless Chrome скриншотом.
- Видеофоны: `<video autoplay muted loop playsinline poster=...>` + фолбэк-img;
  для ленивых видео data-src + подгрузка в scroll-хендлере + kick по первому touch.
- Мобильный вьюпорт первичен (9:16 медиа), тестировать 375–430px.

## После сборки
1. Добавить карточку на хаб `project/index.html` (секция концептов) и ссылку из
   каталога/эпохи, обновить `16_product_promos/BACKLOG.md` (галочка).
2. Деплой: клонировать/обновить репо `github.com/VashikMart/relictum` (gh auth уже есть):
   `git clone https://github.com/VashikMart/relictum /tmp/relictum-deploy` (или pull),
   rsync изменённые файлы + `shared/img/`, commit, push с
   `git -c credential.helper='!gh auth git-credential' push`. Проверить curl'ом 200.
3. Обновить память проекта (memory/relictum_project.md) одной строкой.
