# TestDex

**TestDex** — AMM-биржа на TON **testnet** под вашим управлением.  
Смарт-контракты основаны на открытом коде [STON.fi dex-core-v2](https://github.com/ston-fi/dex-core-v2) (GPL-3.0) и [pTON](https://github.com/ston-fi/pton-contracts) (MIT). Бренд STON.fi не используется.

## Что внутри

| Пакет | Описание |
|-------|----------|
| `contracts/` | DEX Router, Pool, Vault (blueprint + FunC) |
| `pton/` | Wrapped TON для свопов TON ↔ jetton |
| `web/` | React UI: обмен + добавление ликвидности |
| `config/testnet.json` | Адреса задеплоенных контрактов |

## Требования

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Git** (опционально)
- Кошелёк с **testnet TON** — [@testgiver_ton_bot](https://t.me/testgiver_ton_bot)
- API-ключ **Toncenter testnet** — [@toncenter](https://t.me/toncenter)

## Быстрый старт

### 1. Bootstrap

```powershell
cd C:\Project\TestDex
.\scripts\bootstrap.ps1
```

### 2. Настройка `.env`

Скопируйте и заполните:

```env
WALLET_MNEMONIC=ваша seed-фраза из 24 слов
WALLET_VERSION=v5r1
ENDPOINT_URL=https://testnet.toncenter.com/api/v2/jsonRPC
ENDPOINT_TYPE=testnet
ENDPOINT_VERSION=v2
ENDPOINT_KEY=ваш_api_key
```

Скопируйте `.env` в подпроекты (blueprint читает локальный `.env`):

```powershell
Copy-Item .env contracts\.env
Copy-Item .env pton\.env
```

### 3. Деплой на testnet

**Полный пайплайн:**

```powershell
.\scripts\deploy-testnet.ps1
```

**Или по шагам** (каждый скрипт интерактивный — нажимайте Enter для подтверждения):

```powershell
npm run deploy:router      # Router CPI, вы = admin, protocol fee → вам
npm run deploy:pton        # pTON minter
npm run deploy:tokens      # TTA + TTB test jettons, mint 1M каждого
npm run deploy:liquidity   # создать пул TTA/TTB + начальная ликвидность
npm run export:config      # синхронизировать config/testnet.json → web
```

> На деплой Router + libs нужно ~3–5 testnet TON.

### 4. Web UI

```powershell
npm run dev
```

Откройте [http://localhost:5173](http://localhost:5173), подключите **Tonkeeper testnet** и проверьте:

1. **Обмен** — TON ↔ TTA, TTA ↔ TTB  
2. **Ликвидность** — добавление в пул  

## Комиссии

При деплое Router по умолчанию:

- **0.2%** — LP (поставщики ликвидности)  
- **0.1%** — протокол (на ваш `adminAddress`)  

Изменить после деплоя: admin-операция `set_fees` на Router (см. [документацию STON.fi Router](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/router)).

## Структура конфига

После `npm run export:config` файл `config/testnet.json`:

```json
{
  "routerAddress": "kQ...",
  "ptonMasterAddress": "kQ...",
  "adminAddress": "UQ...",
  "tokens": [
    { "symbol": "TTA", "address": "kQ...", "decimals": 9 },
    { "symbol": "TTB", "address": "kQ...", "decimals": 9 }
  ]
}
```

UI читает `web/public/testnet.json` (обновляется автоматически через `export:config`).

## TonConnect

Manifest: `web/public/tonconnect-manifest.json`.  
Для локальной разработки URL `http://localhost:5173` уже указан.

## GitHub Pages

UI можно опубликовать на **https://mrandreano.github.io/testdex/** без своего сервера.

### Настройка репозитория (один раз)

1. Создайте репозиторий [MrAndreano/testdex](https://github.com/MrAndreano/testdex) (если ещё нет).
2. Запушьте код в ветку `main`.
3. В GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

После каждого push в `main` workflow `.github/workflows/deploy-pages.yml` собирает только `web/` и публикует `web/dist`.

### Локальная проверка сборки под Pages

```bash
cd web
VITE_BASE_PATH=/testdex/ VITE_SITE_URL=https://mrandreano.github.io/testdex npm run build:pages
npx vite preview --base /testdex/
```

Откройте URL из вывода `vite preview` и проверьте подключение Tonkeeper.

### Важно для Pages

| Что | Зачем |
|-----|--------|
| `VITE_BASE_PATH=/testdex/` | GitHub Pages отдаёт сайт из подпапки репозитория |
| `VITE_SITE_URL=https://mrandreano.github.io/testdex` | Корректный TonConnect manifest |
| `web/public/testnet.json` | Адреса контрактов (обновляется через `npm run export:config`) |
| `404.html` + `.nojekyll` | SPA fallback и корректная раздача статики |

Опционально: `VITE_TON_API_KEY` в Secrets репозитория (Settings → Secrets) — если Toncenter rate-limit без ключа.

## Лицензии

- `contracts/` — **GPL-3.0** (наследие STON.fi dex-core-v2)  
- `pton/` — **MIT**  
- `web/` — ваш код, MIT по умолчанию  

При публикации форка DEX-кода соблюдайте GPL-3.0.

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| `node` не найден | Установите Node.js 20+, перезапустите терминал |
| Недостаточно TON | Получите testnet TON у @testgiver_ton_bot |
| Swap bounce | Проверьте адреса в `testnet.json`, подождите 30с после деплоя |
| `-13 exit code` | Неверный адрес Router/pTON или несовпадение testnet/mainnet |
| Пул не создаётся | Сначала `deploy:tokens`, подождите 30с, затем `deploy:liquidity` |

## Дальше

- Mainnet: повторите деплой с `ENDPOINT_TYPE=mainnet` и mainnet endpoint  
- Кастомные токены: измените `contracts/scripts/deployTestTokens.ts`  
- Свой домен UI: обновите `tonconnect-manifest.json`
