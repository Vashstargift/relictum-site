# RELICTUM — пакет бренда и сайта · v1.0 (июль 2026)

**Rare objects from deep time.** Люксовая галерея природных артефактов:
Земля · Жизнь · Космос + авторская линия Editions.

## Структура

| Папка | Что внутри |
|---|---|
| `00_brand_assets/` | Логотипы в векторе (SVG/PDF) + `relictum_brand_handoff.json` |
| `01_design_system/` | **index.html** — бренд-бук/дизайн-система, `tokens.css` — переменные |
| `02_site_v1_gallery/` | Сайт **V1 «The Gallery»** (светлый, 6 страниц): index, catalog, object, expeditions, journal, maison |
| `04_presentation/` | **relictum_deck.html** (15 слайдов, ← → листать) + **RELICTUM_deck.pdf** |
| `05_art/` | Сгенерированные визуалы 2K PNG (Higgsfield nano banana pro): товары, интерьеры, упаковка, экспедиции, `grand/` — монументы, `mounts/` — оправы |
| `06_product_design/` | **Продуктовая книга «Оправа для времени»**: 6 типов подставок, настенные системы, интеграция в интерьер, свет, упаковка, документы + **RELICTUM_product_book.pdf** |
| `shared/` | `img/` — веб-версии картинок (1800px JPEG), `brand/` — SVG для сайтов |
| `data/` | `catalog.json` — каталог Relictum (14 объектов), `paleohunters_research.json` — исследование конкурента, `art_manifest.json` — джобы генераций |

## Как смотреть

**Открой `index.html` в корне проекта — это стартовый хаб со ссылками на всё.**

Или напрямую:
- `02_site_v1_gallery/index.html` — сайт-магазин (каталог, фильтры, поиск, сортировка)
- `07_product_presentations/` — продуктовые презентации: `deck_auction.html` (аукционный каталог, 8 лотов) и `deck_campaign.html` (кампания) + PDF
- `08_instagram/index.html` — Instagram: лента, посты, тексты, рубрики
- `04_presentation/relictum_deck.html` — бренд-презентация (стрелки/пробел)
- `01_design_system/index.html` — дизайн-система

Логотип: фирменный лок-ап (комета + RELICTUM + «РОСКОШЬ ВНЕ ВРЕМЕНИ») — `shared/brand/Relictum_lockup_light.png` и `Relictum_lockup_dark.png` (прозрачный фон), собран из оригинальных векторов.

## Ядро айдентики

- Шрифты: **Cormorant Garamond** (display) + **Inter** (UI), Google Fonts
- Палитра: Ivory `#F4F0E8` · Obsidian `#111111` · Bronze `#B08A55` · Deep Bronze `#9A6D34` · Sand `#D8C8AF` · Midnight `#0F1B2E`
- Знак: золотая комета (crop-версии `shared/brand/*_crop.svg` — для UI)
- Слоган: «Роскошь вне времени» / «Formed before us. Kept beyond us.»
