# Пещера Серого Зуба — Telegram Mini App

Пиксельное фэнтези по правилам D&D 5e. Игрок пишет что угодно, ИИ-мастер (Claude) решает, что из этого вышло, а кости и правила считает сама игра.

## Как устроено

- `src/` — исходники игры (страница, движок, рисовалка, звук, логика) и `platform.js` (связь с сервером и Telegram).
- `build.mjs` собирает их в `public/index.html` (`npm run build`).
- `server.mjs` — один сервер на всё:
  - отдаёт игру;
  - `/api/ai` — вызывает Claude ключом сервера и считает бесплатные ходы в день;
  - `/tg/hook` — Telegram-бот: кнопка «Играть» и оплата звёздами (Stars);
  - `/api/admin/stats`, `/api/admin/log?n=200` — статистика и журнал ходов (нужен `?key=ADMIN_KEY`).

## Переменные окружения

| Переменная | Что это |
|---|---|
| `BOT_TOKEN` | токен бота от @BotFather |
| `ANTHROPIC_API_KEY` | ключ Claude API |
| `ADMIN_KEY` | любой длинный пароль для `/api/admin/*` |
| `PUBLIC_URL` | адрес сервера; на Railway берётся сам из `RAILWAY_PUBLIC_DOMAIN` |
| `DATA_DIR` | папка для данных; на Railway — путь тома (volume), берётся сам |
| `GM_MODEL` / `TALK_MODEL` | модель мастера и модель персонажей (по умолчанию `claude-haiku-5-5` / `claude-sonnet-5-5`) |
| `FREE_TURNS` / `FREE_TURNS_WEB` | бесплатных ходов в день в Telegram / на сайте (30 / 10) |
| `PRICE_TURNS50` / `PRICE_MONTH` | цены в звёздах (50 / 250) |
| `DAY_BUDGET` | после стольких $ расходов на ИИ за день бесплатная игра у всех встаёт до завтра (3) |
| `HARD_DAY_BUDGET` | после стольких $ за день ИИ не работает ни для кого (10) |
| `FREE_USER_DAY` / `PASS_USER_DAY` | предел $ в день на одного бесплатного игрока / на одного с безлимитом (0.10 / 0.10) |
| `SUPPORT_CONTACT` | контакт для команды /paysupport |

## Запуск локально

```
npm install
npm run build
ANTHROPIC_API_KEY=... npm start
```

Без `ANTHROPIC_API_KEY` игра работает в упрощённом режиме без ИИ.
