# Вам осталось только 3 шага

Я уже сделал за вас:
- [x] Установил Node.js
- [x] `npm install` + сборка контрактов (contracts + pton)
- [x] Создал `.env` из шаблона
- [x] Автодеплой без нажатия Enter (`TESTDEX_AUTO_CONFIRM=1`)

---

## Шаг 1 — Заполните `.env` (2 минуты)

Откройте файл:

```
C:\Project\TestDex\.env
```

Замените placeholder на реальные данные:

```env
WALLET_MNEMONIC=ваши 24 слова testnet кошелька
WALLET_VERSION=v5r1
ENDPOINT_URL=https://testnet.toncenter.com/api/v2/jsonRPC
ENDPOINT_TYPE=testnet
ENDPOINT_VERSION=v2
ENDPOINT_KEY=ключ_от_@toncenter
```

> **Кошелёк W5 (Tonkeeper):** в `.env` указано `WALLET_VERSION=v5r1` — так blueprint обозначает Wallet V5.

---

## Шаг 2 — Получите testnet TON (1 минута)

1. Узнайте адрес кошелька из seed-фразы (Tonkeeper → Testnet).
2. Напишите [@testgiver_ton_bot](https://t.me/testgiver_ton_bot) — нужно **~5 TON**.

---

## Шаг 3 — Запустите автодеплой (одна команда)

```powershell
cd C:\Project\TestDex
.\scripts\user-deploy.cmd
```

Скрипт сам:
- задеплоит Router, pTON, токены TTA/TTB, пул;
- экспортирует `config\testnet.json`.

**Подпись в Tonkeeper для деплоя НЕ нужна** — транзакции подписываются из `.env` автоматически.

---

## Тестирование (здесь нужен Tonkeeper)

```powershell
npm run dev
```

Откройте http://localhost:5173 → подключите **Tonkeeper testnet** → обменяйте TON ↔ TTA.

Здесь вы **подписываете транзакции в кошельке**.

---

## GitHub Pages (опционально)

1. Создайте репозиторий `dexpages` на GitHub.
2. Залейте папку `C:\Project\dexpages`.
3. Settings → Pages → Source: **GitHub Actions**.
4. Перед push синхронизируйте конфиг:

```powershell
cd C:\Project\dexpages
.\scripts\sync-config.cmd
```

Сайт: `https://ВАШ_ЛОГИН.github.io/dexpages/`

---

## Если что-то пошло не так

| Команда | Когда |
|---------|-------|
| `.\scripts\bootstrap.cmd` | Переустановка зависимостей |
| `.\scripts\YOUR_TODO.cmd` | Напоминание что делать |
| `.\scripts\user-deploy.cmd` | Деплой после заполнения `.env` |
