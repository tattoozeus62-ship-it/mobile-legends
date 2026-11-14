// ابزارهای فارسی: اعداد فارسی، درصد، escape برای HTML تلگرام
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function faNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v).replace(/[0-9]/g, (d) => FA_DIGITS[+d]).replace(/\./g, '٫');
}

function faInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return faNum(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'));
}

// x: نسبت 0..1 یا درصد 0..100 — اگر >1 فرض می‌شود درصد است
function pct(x, digits = 1) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '—';
  const p = n <= 1 ? n * 100 : n;
  return faNum(p.toFixed(digits)) + '٪';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const FOOTER = '';

// تمیز کردن توضیحات بازی از تگ‌های HTML و entityها
function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s, n = 900) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

module.exports = { faNum, faInt, pct, esc, FOOTER, cleanText, truncate };
