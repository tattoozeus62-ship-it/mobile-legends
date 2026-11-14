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

// ---------- نقش و لین هیرو — نام فارسی ----------
// ترتیب نمایش نقش‌ها: تیرانداز، مبارز، قاتل، جادوگر، تانک، پشتیبان
const ROLES = [
  { en: 'Marksman', fa: 'تیرانداز', emoji: '🏹' },
  { en: 'Fighter', fa: 'مبارز', emoji: '⚔️' },
  { en: 'Assassin', fa: 'قاتل', emoji: '🗡️' },
  { en: 'Mage', fa: 'جادوگر', emoji: '🔮' },
  { en: 'Tank', fa: 'تانک', emoji: '🛡️' },
  { en: 'Support', fa: 'پشتیبان', emoji: '💚' },
];
const ROLE_FA = Object.fromEntries(ROLES.map((r) => [r.en, r.fa]));
const LANE_FA = { gold: 'گلد', exp: 'اکس‌پی', mid: 'مید', jungle: 'جانگل', roam: 'روم' };

function normLaneKey(s) {
  return String(s || '').toLowerCase().replace(/\s*lane\s*$/, '').replace(/jungling/g, 'jungle').replace(/roaming/g, 'roam').trim();
}

// 'Fighter, Assassin' -> 'مبارز، قاتل' | 'Tank' -> 'تانک'
function roleFa(classStr) {
  return String(classStr || '').split(',').map((s) => ROLE_FA[s.trim()] || s.trim()).filter(Boolean).join('، ');
}

// ['exp lane', 'jungle'] یا ['jungle, roam'] -> 'اکس‌پی، جانگل' / 'جانگل، روم'
function laneFa(laning) {
  const out = [];
  for (const l of (laning || [])) {
    for (const p of String(l).split(',')) {
      const k = normLaneKey(p);
      if (k && LANE_FA[k] && !out.includes(LANE_FA[k])) out.push(LANE_FA[k]);
    }
  }
  return out.join('، ');
}

// نقش‌های هیرو به‌صورت آرایهٔ انگلیسی: 'Fighter, Assassin' -> ['Fighter', 'Assassin']
function roleList(classStr) {
  return String(classStr || '').split(',').map((s) => s.trim()).filter((s) => ROLE_FA[s]);
}

// لین‌های هیرو به‌صورت کلید انگلیسی: ['exp lane', 'jungle'] -> ['exp', 'jungle']
function laneList(laning) {
  const out = [];
  for (const l of (laning || [])) {
    for (const p of String(l).split(',')) {
      const k = normLaneKey(p);
      if (k && LANE_FA[k] && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

module.exports = { faNum, faInt, pct, esc, FOOTER, cleanText, truncate, ROLES, ROLE_FA, LANE_FA, roleFa, laneFa, roleList, laneList };
