---
name: relictum-catalog-pdf
description: Печатный PDF-каталог коллекции Relictum — добавить экспонат в каталог, перегенерить PDF, обновить Canva-версию, адаптировать дизайн-систему под другой бренд. Использовать когда просят обновить/пересобрать каталог-презентацию, добавить экспонат в PDF, сделать каталог для другого бренда.
---

# Конвейер печатного каталога RELICTUM (data-driven)

Данные: `07_product_presentations/catalog_data.js` — массив EXHIBITS (+ WORLDS).
Генератор: `07_product_presentations/render_catalog_pdf.js` собирает
`catalog_collection_2026.html` (НЕ править руками — перезапишется) и рендерит
`RELICTUM_collection_2026.pdf`. Дизайн-система: `CATALOG_DESIGN_SYSTEM.md` — прочитать ПЕРЕД правками.
Каталог = вся реальная коллекция, цены НЕ публикуются («Цена по запросу»).

## Добавить/поправить экспонат
1. Дописать объект в `EXHIBITS` (catalog_data.js): world (cosmos/vita/grand), id, name, latin,
   kicker, hook, desc, rows[[k,v]×4], photo (имя файла в shared/img без .jpg). Опционально:
   `prov:true` (плашка «рабочее фото» для нестудийных кадров), `alive:{title,story[],still,era,home,homeText}`
   для якорных экспонатов с видео существа.
2. Медиа положить в `shared/img/`: `ph_<slug>.jpg` (студийный кадр объекта). Для alive —
   `still_alive_*.jpg` (кадр из vid_*.mp4: `ffmpeg -ss 3 -i vid_X.mp4 -frames:v 1 -q:v 2 out.jpg`)
   и `int_ph_*.jpg` (интерьер).
3. Перегенерить (см. ниже), проверить полосы глазами через pypdfium2.

## Перегенерить PDF
```bash
cd 07_product_presentations && node render_catalog_pdf.js
```
В облачной сессии Claude playwright-core и Chromium ставятся в scratchpad — запускать с
`NODE_PATH=<scratchpad>/node_modules CHROMIUM_PATH=/opt/pw-browsers/chromium FONT_CSS_PATH=<fonts.css>`.
На Маке — просто `node render_catalog_pdf.js` (Google Fonts подхватятся).
В облачной сессии Claude: Google Fonts может быть заблокирован — собрать локальный CSS
@font-face из npm-пакетов @fontsource/cormorant-garamond и @fontsource/inter
(веса 300–600 + italic, subsets cyrillic+latin) и передать через FONT_CSS_PATH.
Проверка: отрендерить страницы через pypdfium2 и посмотреть глазами (мин. обложку,
оглавление, новые полосы). Типовые грабли: h1 без serif — есть глобальное правило;
QR-SVG должен иметь viewBox; сетка оглавления рассчитана на 2 ряда по 4.

## Деплой и Canva
1. Коммит в приватный репо, деплой PDF+HTML по стандартному конвейеру (CLAUDE.md §Деплой).
2. Публичный URL PDF: `https://vashikmart.github.io/relictum/07_product_presentations/RELICTUM_collection_2026.pdf`.
3. Canva-версию обновить: `mcp__Canva__import-design-from-url` с этим URL
   (intended_design_type: a4_landscape) — появится новая редактируемая копия в Canva
   владельца. Старую копию можно удалить/архивировать в Canva руками.

## Каталог для другого бренда
1. Скопировать `catalog_collection_2026.html` под новым именем.
2. Заменить `:root`-токены (цвета), пару шрифтов, wordmark, контакты, QR (segno).
3. Структуру полос сохранить (паспорт → «встретить живым»/повествование → дивайдеры → сервис → финал) — это и есть система.
4. Медиа-конвенции завести по аналогии (канонное фото объекта + «живой»/атмосферный кадр + деталь-стрип).
