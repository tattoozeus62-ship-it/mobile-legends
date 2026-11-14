// کلاینت تلگرام برای Cloudflare Workers — به‌جای node-fetchِ Telegraf از
// fetch سراسری استفاده می‌کند (node-fetch در Workers وجود ندارد).
//
// چرا ساب‌کلاس: همهٔ متدهای Telegram (sendMessage، sendPhoto،
// setChatMenuButton، answerCbQuery و…) از callApi رد می‌شوند؛ با بازنویسی
// فقط همین یک متد، کل ربات روی fetch سراسری می‌دود.
//
// فقط JSON فرستاده می‌شود (عکس‌ها با URL)؛ آپلود فایل پشتیبانی نمی‌شود —
// ربات در این حالت هرگز فایل نمی‌فرستد (عکس خوشامد با URL می‌آید،
// پرترهٔ هیرو هم URL است).
import { Telegram } from '../../node_modules/telegraf/lib/telegram.js';
import TelegramError from '../../node_modules/telegraf/lib/core/network/error.js';

const TELEGRAM_API = 'https://api.telegram.org';

function hasFileSource(v, seen = new Set()) {
  if (!v || typeof v !== 'object' || seen.has(v)) return false;
  seen.add(v);
  if (Object.prototype.hasOwnProperty.call(v, 'source') && v.source != null) return true;
  return Object.values(v).some((x) => hasFileSource(x, seen));
}

// قرارداد callApi دقیقاً مثل ApiClient اصلی است: data.result را برمی‌گرداند
// و روی خطا TelegramError می‌اندازد (با همان response/code).
class WorkerTelegram extends Telegram {
  constructor(token) {
    super(token, { webhookReply: false });
  }

  async callApi(method, payload = {}, { signal } = {}) {
    if (hasFileSource(payload)) {
      throw new TelegramError(
        { error_code: 400, description: 'WorkerTelegram: file upload is not supported, URL only' },
        { method, payload },
      );
    }
    const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // nullها مثل کلاینت اصلی حذف می‌شوند
      body: JSON.stringify(payload ?? {}, (_k, v) => (v == null ? undefined : v)),
      signal,
    });
    if (res.status >= 500) {
      throw new TelegramError(
        { error_code: res.status, description: res.statusText || 'Telegram API error' },
        { method, payload },
      );
    }
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) {
      throw new TelegramError(
        {
          error_code: (data && data.error_code) || res.status,
          description: (data && data.description) || `Telegram API error (${method})`,
          parameters: data && data.parameters,
        },
        { method, payload },
      );
    }
    return data.result;
  }
}

export { WorkerTelegram };
