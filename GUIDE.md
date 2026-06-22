# TestDex — пошаговое руководство

Полный цикл: от установки до тестирования обмена и ликвидности на TON **testnet**.

---

## Обзор

| Проект | Путь | Задача |
|--------|------|--------|
| **TestDex** | `C:\Project\TestDex` | Контракты + локальный UI |
| **DexPages** | `C:\Project\dexpages` | UI на GitHub Pages (опционально) |

**Порядок работы:** сначала деплой контрактов в TestDex → затем тест через локальный UI или GitHub Pages.

---

## Часть 0. Что понадобится

### Программы

1. **Node.js 20+** — https://nodejs.org/  
   Проверка:
   ```powershell
   node -v
   npm -v
   ```

2. **Git** (опционально, для GitHub Pages) — https://git-scm.com/

### TON testnet

1. **Кошелёк Tonkeeper** (или другой с TonConnect)  
   - Установите приложение  
   - Переключите сеть на **Testnet** (Настройки → Testnet)

2. **Testnet TON** (~5 TON на деплой)  
   - Telegram-бот: [@testgiver_ton_bot](https://t.me/testgiver_ton_bot)  
   - Отправьте боту адрес вашего testnet-кошелька

3. **API-ключ Toncenter (testnet)**  
   - Telegram: [@toncenter](https://t.me/toncenter)  
   - Получите ключ для `testnet`

4. **Seed-фраза кошелька для деплоя контрактов**  
   - Можно создать **отдельный** testnet-кошелёк только для деплоя  
   - ⚠️ Никогда не используйте mainnet-кошелёк с реальными средствами для экспериментов

---

## Часть 1. Установка TestDex

### Шаг 1.1 — Bootstrap

**Вариант A (рекомендуется, без настройки PowerShell):**

```powershell
cd C:\Project\TestDex
.\scripts\bootstrap.cmd
```

**Вариант B — PowerShell-скрипт** (если разрешены `.ps1`):

```powershell
cd C:\Project\TestDex
.\scripts\bootstrap.ps1
```

> Если `.ps1` блокируется с ошибкой `UnauthorizedAccess`, используйте **`.cmd`** выше  
> или один раз выполните:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
> Либо разовый запуск:
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
> ```

Скрипт:
- проверит Node.js;
- создаст `.env` из `.env.example`;
- скопирует `.env` в `contracts\` и `pton\`;
- установит зависимости;
- скомпилирует смарт-контракты.

> Если `bootstrap.ps1` заблокирован:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

### Шаг 1.2 — Настройка `.env`

Откройте `C:\Project\TestDex\.env`:

```env
WALLET_MNEMONIC=word1 word2 word3 ... word24
WALLET_VERSION=v5r1
ENDPOINT_URL=https://testnet.toncenter.com/api/v2/jsonRPC
ENDPOINT_TYPE=testnet
ENDPOINT_VERSION=v2
ENDPOINT_KEY=ваш_ключ_от_toncenter
```

| Поле | Описание |
|------|----------|
| `WALLET_MNEMONIC` | 24 слова кошелька, с которого идёт деплой |
| `WALLET_VERSION` | **`v5r1`** для Tonkeeper **W5** (в blueprint W5 = v5r1) |
| `ENDPOINT_KEY` | API key от @toncenter |

После изменения `.env` скопируйте его снова:

```powershell
Copy-Item .env contracts\.env -Force
Copy-Item .env pton\.env -Force
```

### Шаг 1.3 — Пополните кошелёк деплоя

1. Узнайте адрес кошелька из seed-фразы (Tonkeeper → Testnet → получить адрес).
2. Получите TON у [@testgiver_ton_bot](https://t.me/testgiver_ton_bot).
3. Нужно **~3–5 testnet TON** на полный деплой.

---

## Часть 2. Деплой контрактов на testnet

Каждый скрипт **интерактивный** — читайте вывод и нажимайте **Enter** для подтверждения.

### Вариант A — всё одной командой

```powershell
cd C:\Project\TestDex
.\scripts\deploy-testnet.cmd
```

(или `.\scripts\deploy-testnet.ps1` если PowerShell-скрипты разрешены)

### Вариант B — по шагам (рекомендуется при первом запуске)

#### Шаг 2.1 — Router (DEX)

```powershell
npm run deploy:router
```

Что происходит:
- деплоятся библиотеки контрактов (libs);
- деплоится **Router CPI** (constant product AMM);
- **вы становитесь admin** — протокольные комиссии идут на ваш адрес.

Запишите адрес Router из вывода или из `contracts\build\deploy.config.json`.

#### Шаг 2.2 — pTON (wrapped TON)

```powershell
npm run deploy:pton
```

Нужен для свопов **TON ↔ jetton**.

Адрес сохранится в `pton\build\deploy.config.json`.

#### Шаг 2.3 — Тестовые токены TTA и TTB

```powershell
npm run deploy:tokens
```

Создаются два jetton:
- **TTA** — TestToken Alpha  
- **TTB** — TestToken Beta  

На ваш admin-кошелёк минтится по **1 000 000** каждого.

⏳ Подождите **30 секунд** (деploy jetton-кошельков асинхронный).

#### Шаг 2.4 — Пул и начальная ликвидность

```powershell
npm run deploy:liquidity
```

Создаётся пул **TTA/TTB** с начальной ликвидностью (~10 000 каждого токена).

#### Шаг 2.5 — Экспорт конфига для UI

```powershell
npm run export:config
```

Обновляет:
- `config\testnet.json`
- `web\public\testnet.json`

### Проверка деплоя

Откройте `C:\Project\TestDex\config\testnet.json` — поля должны быть заполнены:

```json
{
  "routerAddress": "kQ...",
  "ptonMasterAddress": "kQ...",
  "tokens": [
    { "symbol": "TTA", "address": "kQ..." },
    { "symbol": "TTB", "address": "kQ..." }
  ]
}
```

Пустые адреса = деплой не завершён или export не запускался.

---

## Часть 3. Локальный UI и тестирование

### Шаг 3.1 — Запуск UI

```powershell
cd C:\Project\TestDex
npm run dev
```

Откройте: **http://localhost:5173**

### Шаг 3.2 — Подключение кошелька

1. В Tonkeeper включите **Testnet**.
2. На сайте нажмите **«Подключить кошелёк»**.
3. Подтвердите подключение в Tonkeeper.

> Для тестов удобно использовать **тот же** кошелёк, куда замintили TTA/TTB, или другой testnet-кошелёк с TON.

### Шаг 3.3 — Тест: обмен TON → TTA

1. Вкладка **«Обмен»**.
2. **Отдаёте:** TON, **Получаете:** TTA.
3. Количество: `0.5` (или меньше).
4. **«Обменять»** → подтвердите в кошельке.

✅ **Успех:** транзакция прошла, баланс TTA вырос.

❌ **Bounce / ошибка:**
- подождите 1–2 мин после деплоя;
- проверьте `testnet.json`;
- убедитесь, что в пуле есть ликвидность (`deploy:liquidity`).

### Шаг 3.4 — Тест: обмен TTA → TTB

1. **Отдаёте:** TTA, **Получаете:** TTB.
2. Количество: `100`.
3. Подтвердите транзакцию.

### Шаг 3.5 — Тест: обмен TTB → TON

1. **Отдаёте:** TTB, **Получаете:** TON.
2. Количество: `50`.
3. Подтвердите.

### Шаг 3.6 — Тест: добавление ликвидности

1. Вкладка **«Ликвидность»**.
2. Токен A: **TTA**, количество: `500`.
3. Токен B: **TTB**, количество: `500`.
4. **«Добавить ликвидность»**.

Для **нового** пула UI отправит две транзакции (с паузой ~15 с).  
Для **существующего** пула — достаточно одной пары транзакций.

✅ **Успех:** вы получаете LP-токены пула (видны в кошельке или on-chain).

### Шаг 3.7 — Проверка on-chain (опционально)

Откройте адрес Router на testnet-эксплорере:

```
https://testnet.tonscan.org/
```

Вставьте `routerAddress` из `testnet.json` — должны быть входящие swap-транзакции.

---

## Часть 4. GitHub Pages (DexPages) — опционально

Если нужен UI в интернете без локального сервера.

### Шаг 4.1 — Синхронизация конфига

```powershell
cd C:\Project\dexpages
.\scripts\sync-config.ps1
```

Копирует `TestDex\config\testnet.json` → `dexpages\public\testnet.json`.

### Шаг 4.2 — Локальная проверка

```powershell
npm install
npm run dev
```

http://localhost:5173 — те же тесты, что в части 3.

### Шаг 4.3 — Публикация

```powershell
git init
git add .
git commit -m "TestDex UI"
git remote add origin https://github.com/YOUR_USERNAME/dexpages.git
git push -u origin main
```

На GitHub: **Settings → Pages → Source: GitHub Actions**

Через 1–3 минуты сайт доступен:

```
https://YOUR_USERNAME.github.io/dexpages/
```

### Шаг 4.4 — Тест на Pages

1. Откройте URL в браузере (HTTPS обязателен для TonConnect).
2. Tonkeeper → Testnet → подключите кошелёк.
3. Повторите тесты из части 3.

---

## Часть 5. Чеклист «всё работает»

- [ ] Node.js 20+ установлен  
- [ ] `.env` заполнен, `.env` скопирован в `contracts\` и `pton\`  
- [ ] На кошельке деплоя ≥ 3 testnet TON  
- [ ] `deploy:router` — Router задеплоен  
- [ ] `deploy:pton` — pTON задеплоен  
- [ ] `deploy:tokens` — TTA и TTB замintены  
- [ ] `deploy:liquidity` — пул TTA/TTB создан  
- [ ] `export:config` — `testnet.json` заполнен  
- [ ] UI открывается, кошелёк подключается  
- [ ] Swap TON → TTA проходит  
- [ ] Swap TTA → TTB проходит  
- [ ] Swap TTB → TON проходит  
- [ ] Добавление ликвидности проходит  

---

## Частые проблемы

| Симптом | Причина | Решение |
|---------|---------|---------|
| Адрес деплоя не совпадает с Tonkeeper W5 | Убедитесь, что seed-фраза от **того же** W5-аккаунта и `WALLET_VERSION=v5r1` |
| Недостаточно TON | Мало testnet TON | @testgiver_ton_bot |
| Жёлтый баннер «контракты не задеплоены» | Пустой `testnet.json` | `npm run export:config` |
| Swap bounce | Нет ликвидности / рано после деплоя | `deploy:liquidity`, подождать 1–2 мин |
| exit code -13 | Неверный адрес Router/pTON | Проверить testnet vs mainnet адреса |
| TonConnect не подключается | HTTP вместо HTTPS / неверный manifest | Локально: localhost OK; Pages: только HTTPS |
| Белая страница на Pages | Неверный base path | Репозиторий `dexpages`, см. dexpages README |
| `deploy:liquidity` падает | Jetton-кошельки ещё не готовы | Подождать 30–60 с после `deploy:tokens` |

---

## Схема проекта

```
TestDex (локально)
├── contracts/     → деплой Router, токены, пул
├── pton/          → деплой pTON
├── web/           → UI localhost:5173
└── config/        → testnet.json (адреса)

DexPages (GitHub)
└── public/testnet.json  ← sync из TestDex
    └── UI на username.github.io/dexpages/
```

---

## Что дальше

- **Mainnet:** смените endpoint в `.env` на mainnet, задеплойте заново (реальные TON!).  
- **Свои токены:** отредактируйте `contracts/scripts/deployTestTokens.ts`.  
- **Комиссии:** admin-операция `set_fees` на Router (0.2% LP + 0.1% protocol по умолчанию).  
- **Свой домен на Pages:** обновите `VITE_SITE_URL` в workflow dexpages.

---

## Быстрая шпаргалка команд

```powershell
# Установка
cd C:\Project\TestDex
.\scripts\bootstrap.cmd
# → заполнить .env → Copy-Item .env contracts\.env; Copy-Item .env pton\.env

# Деплой
npm run deploy:router
npm run deploy:pton
npm run deploy:tokens
Start-Sleep -Seconds 30
npm run deploy:liquidity
npm run export:config

# UI
npm run dev
# → http://localhost:5173

# GitHub Pages (опционально)
cd C:\Project\dexpages
.\scripts\sync-config.ps1
npm install && npm run dev
```
