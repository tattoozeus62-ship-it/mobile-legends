# ربات تلگرام MLBB + مینی‌اپ فارسی 🇮🇷

ربات تلگرام **Mobile Legends: Bang Bang** با مینی‌اپ کاملاً فارسی — هیروها، متا، کانتر، بیلد، آیتم، امبلم/اسپل، جدول MPL و ماشین‌حساب وین‌ریت — با دادهٔ زنده و توضیحات فارسی.

- 🤖 ربات تلگرام: **[@Mlbb_Baz_bot](https://t.me/Mlbb_Baz_bot)**
- 📱 مینی‌اپ زنده: **https://yahootattoo1-commits.github.io/mobile-legends/**

> 🇬🇧 **English summary:** A Persian Telegram bot + Mini App for Mobile Legends: Bang Bang — live heroes, meta, counters, builds, items, emblems/spells, MPL standings and a win-rate calculator, with all skill/item descriptions translated to Persian. Live data from the Rone Arena API, offline fallback from p3hndrx/MLBB-API.

## دستورهای ربات

| دستور | کار |
|---|---|
| `/start` | خوش‌آمد + دکمهٔ باز کردن مینی‌اپ |
| `/hero <نام>` | اطلاعات هیرو، مهارت‌ها (فارسی) و وین‌ریت زنده |
| `/meta` | ۱۰ هیروی برتر متا (۷ روز اخیر) |
| `/counter <نام>` | بهترین و بدترین کانترهای هیرو |
| `/build <نام> <lane>` | بیلد پیشنهادی (lane: `exp` ،`mid` ،`gold` ،`roam` ،`jungle`) |
| `/items` ،`/item <نام>` | جست‌وجو و جزئیات آیتم |
| `/emblems` | امبلم‌ها، تلنت‌ها |
| `/wr <مچ> <وین‌ریت فعلی> <هدف>` | چند برد پشت سر هم لازم است |
| `/mpl <id\|ph\|my\|kh>` | جدول لیگ MPL |
| `/player` | پروفایل بازیکن (با کد تایید داخل بازی) |
| `/version` | نسخهٔ فعلی بازی |

## اجرای محلی

```bash
git clone https://github.com/tattoozeus62-ship-it/mobile-legends.git
cd mobile-legends/bot
npm install
cp .env.example .env   # توکن ربات را از @BotFather بگیر و در BOT_TOKEN بگذار
npm start
```

متغیرها (`.env`):

| متغیر | توضیح |
|---|---|
| `BOT_TOKEN` | توکن ربات تلگرام (اجباری) |
| `PORT` | پورت سرور وب (پیش‌فرض `3108`) |
| `MINIAPP_URL` | آدرس مینی‌اپ برای دکمهٔ `/start` (اختیاری) |
| `RONE_BASE` | آدرس Rone Arena API (پیش‌فرض `https://arena.rone.dev/api`) |

بدون دیتابیس کار می‌کند؛ کش ۵ دقیقه‌ای در حافظه دارد. Node.js نسخهٔ ۱۸ یا بالاتر.

## ساختار ریپو

```text
/                 مینی‌اپ فارسی (GitHub Pages) — index.html ،app.js ،style.css ،data/
bot/              سورس ربات تلگرام (Node.js — Telegraf + Express)
bot/src/          bot.js ،index.js ،rone.js ،staticData.js ،fa.js
bot/data/         دیتای آفلاین هیرو/آیتم/امبلم/تلنت + ترجمهٔ فارسی توضیحات
```

## توضیحات فارسی

همهٔ توضیحات مهارت‌ها (۵۹۰ مهارت، ۱۳۳ هیرو)، آیتم‌ها، تلنت‌ها و اسپل‌ها به فارسی ترجمه شده‌اند و در `data/fa-overrides.json` نگه داشته می‌شوند. مینی‌اپ و ربات هر دو از همین فایل استفاده می‌کنند؛ اگر ترجمه‌ای برای موردی نباشد، متن انگلیسی نشان داده می‌شود.

## منبع داده

| منبع | کاربرد |
|---|---|
| **Rone Arena API** — `https://arena.rone.dev/api` | دادهٔ زنده: هیروها، وین‌ریت/بن‌ریت، کانتر، بیلد، اسپل، MPL |
| **p3hndrx/MLBB-API** — فایل‌های `data/` | دیتای آفلاین هیرو/آیتم/امبلم/تلنت + فالبک وقتی سرویس زنده خطا بدهد |

> ⚠️ این پروژهٔ غیررسمی و کامیونیتی است و وابسته به Moonton نیست. داده‌های بازی © Moonton. Rone Arena هم پروژهٔ رسمی نیست؛ اگر روزی قطع شد، بخش‌های استاتیک و محاسبهٔ محلی وین‌ریت هنوز کار می‌کنند.

## لایسنس

MIT — فایل [LICENSE](LICENSE) را ببینید.
