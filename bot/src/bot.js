// ربات تلگرام MLBB — Telegraf با polling
// همهٔ متن‌ها فارسی و راست‌چین؛ فوتر منبع داده در همهٔ پاسخ‌ها
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { roneGet, ronePost, clearCache, normRankRecord, normCounterRecord, normBuildRecord, normStanding, equipNameMap } = require('./rone');
const sd = require('./staticData');
const { faNum, faInt, pct, esc, FOOTER, cleanText, truncate, ROLES, roleFa, laneFa } = require('./fa');

const MINIAPP_URL = process.env.MINIAPP_URL || '';
const LANES = [
  { v: 'exp', fa: '🛡️ اکس‌پی (EXP)' },
  { v: 'mid', fa: '🔮 مید (Mid)' },
  { v: 'gold', fa: '🏹 گلد (Gold)' },
  { v: 'roam', fa: '🚶 روم (Roam)' },
  { v: 'jungle', fa: '🌿 جانگل (Jungle)' },
];
const LEAGUES = [
  { v: 'id', fa: '🇮🇩 MPL اندونزی (ID)' },
  { v: 'ph', fa: '🇵🇭 MPL فیلیپین (PH)' },
  { v: 'my', fa: '🇲🇾 MPL مالزی (MY)' },
  { v: 'kh', fa: '🇰🇭 MPL کامبوج (KH)' },
];

// وضعیت موقت /player برای هر چت — JWT فقط در حافظهٔ همین پروسه نگه داشته می‌شود
const playerSessions = new Map(); // chatId -> { step, gameId, zoneId, jwt }

// ---------- مدیریت ربات ----------
// شناسهٔ عددی مدیرها از ADMIN_ID (متغیر محیطی، با کاما جدا می‌شود).
// روی این سرور از فایل admin.id خوانده می‌شود و هرگز در ریپوی عمومی نمی‌آید.
const ADMIN_IDS = new Set((process.env.ADMIN_ID || '').split(',').map((s) => s.trim()).filter(Boolean));
const isAdmin = (ctx) => !!ctx?.from && ADMIN_IDS.has(String(ctx.from.id));
function requireAdmin(ctx) {
  if (isAdmin(ctx)) return true;
  ctx.replyWithHTML('⛔ این بخش فقط برای مدیر ربات است.' + FOOTER).catch(() => {});
  return false;
}
const BOOT_TIME = new Date();

// کاربران ربات — برای شمارش و پیام همگانی؛ فقط در logs/users.json روی همین سرور نگه داشته می‌شود
const USERS_FILE = path.join(__dirname, '..', 'logs', 'users.json');
const users = new Map(); // id -> { id, name, username, firstSeen, lastSeen }
function loadUsers() {
  try {
    const arr = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    for (const u of (Array.isArray(arr) ? arr : [])) if (u?.id) users.set(String(u.id), u);
  } catch { /* اولین اجرا — هنوز کاربری نیست */ }
}
function saveUsers() {
  try {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify([...users.values()], null, 1));
  } catch { /* ذخیره نشد — شمارش در حافظه می‌ماند */ }
}
function trackUser(ctx) {
  const from = ctx?.from;
  if (!from) return;
  const id = String(from.id);
  const now = new Date().toISOString();
  const prev = users.get(id);
  if (!prev) {
    users.set(id, { id, name: [from.first_name, from.last_name].filter(Boolean).join(' ') || '', username: from.username || '', firstSeen: now, lastSeen: now });
    saveUsers();
  } else {
    prev.lastSeen = now;
    if (from.username && prev.username !== from.username) { prev.username = from.username; saveUsers(); }
  }
}
loadUsers();
const adminBroadcasts = new Map(); // chatId -> { step, text } — پیش‌نویس پیام همگانی در انتظار تایید

function webAppButton() {
  if (!MINIAPP_URL) return null;
  return Markup.button.webApp('🎮 باز کردن مینی‌اپ', MINIAPP_URL);
}

function mainMenuKeyboard(isAdminUser = false) {
  const rows = [
    [Markup.button.callback('🦸 هیروها', 'menu_heroes'), Markup.button.callback('📊 متا', 'menu_meta')],
    [Markup.button.callback('⚔️ کانتر', 'menu_counter'), Markup.button.callback('🛠️ بیلد', 'menu_build')],
    [Markup.button.callback('🧮 ماشین وین‌ریت', 'menu_wr'), Markup.button.callback('🏆 MPL', 'menu_mpl')],
  ];
  if (isAdminUser) rows.push([Markup.button.callback('🛠️ پنل مدیریت', 'menu_admin')]);
  const wa = webAppButton();
  if (wa) rows.unshift([wa]);
  return Markup.inlineKeyboard(rows);
}

async function getRankList(days = 7, size = 10) {
  // size=140 یکجا همهٔ هیروها را می‌دهد؛ اگر API قبول نکرد با ۱۰۰ برمی‌گردیم
  let r = await roneGet(`/heroes/rank?days=${days}&size=140&index=1`);
  if (!r.ok) r = await roneGet(`/heroes/rank?days=${days}&size=100&index=1`);
  if (!r.ok) return r;
  const all = r.records.map(normRankRecord).filter((x) => x.id != null);
  return { ok: true, all };
}

async function heroHead(id) {
  const r = await roneGet(`/heroes/${id}`);
  if (!r.ok) return null;
  const rec = r.records[0];
  return rec?.data?.hero?.data?.head || rec?.data?.data?.hero?.data?.head || null;
}

function heroNotFoundText(query, suggestions) {
  let t = `❌ هیرویی با نام «${query}» پیدا نشد.`;
  if (suggestions && suggestions.length) {
    t += '\n\nشاید منظورت این‌هاست:\n' + suggestions.map((h) => `• ${h.hero_name}`).join('\n');
    t += '\n\nنام انگلیسی هیرو را بنویس؛ مثلاً: /hero Miya';
  } else {
    t += '\nنام انگلیسی هیرو را کامل یا بخشی از آن را بنویس؛ مثلاً: /hero Miya یا /hero Gusion';
  }
  return t + FOOTER;
}

// اگر HTTPS_PROXY ست شده (مثلاً در VM میزبان که خروج مستقیم بسته است)،
 // Telegraf باید از همان پروکسی رد شود — node-fetchِ Telegraf خودش
 // متغیرهای پروکسی را نمی‌خواند. در WispByte پروکسی نیست و agent خالی می‌ماند.
function telegramProxyAgent() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  if (!proxy) return undefined;
  try {
    const { HttpsProxyAgent } = require('hpagent');
    return new HttpsProxyAgent({ proxy });
  } catch {
    return undefined;
  }
}

function createBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.log('[bot] BOT_TOKEN تنظیم نشده — ربات راه‌اندازی نمی‌شود، فقط سرور وب بالا می‌آید.');
    return null;
  }
  const agent = telegramProxyAgent();
  const bot = new Telegraf(token, agent ? { telegram: { agent, attachmentAgent: agent } } : {});
  console.log('[bot] admin:', ADMIN_IDS.size > 0 ? 'configured' : 'not configured');

  const helpText = `🤖 <b>راهنمای ربات MLBB</b>

<b>دستورها:</b>
/hero &lt;نام هیرو&gt; — اطلاعات هیرو، اسکیل‌ها و وین‌ریت زنده
/heroes — لیست هیروها بر اساس نقش (۱۳۳ هیرو در ۶ نقش)
/meta — برترین هیروهای متا (۷ روز اخیر، وین‌ریت)
/counter &lt;نام هیرو&gt; — بهترین کانترهای آن هیرو
/build &lt;نام هیرو&gt; — بیلد پیشنهادی (بعد لین را انتخاب کن)
/items — لیست آیتم‌ها
/item &lt;نام آیتم&gt; — جزییات آیتم
/emblems — امبلم‌ها و تلنت‌ها
/wr &lt;مچ فعلی&gt; &lt;وین‌ریت فعلی&gt; &lt;وین‌ریت هدف&gt; — چند برد پشت سر هم لازم است؟
/mpl — جدول لیگ‌های MPL (ID / PH / MY / KH)
/player — اتصال پروفایل بازی (با کد تایید داخل بازی)
/version — نسخهٔ فعلی بازی
/admin — پنل مدیریت (فقط مدیر)
/help — همین راهنما

🔍 نام هیرو را می‌توانی به انگلیسی، کامل یا بخشی از آن بنویسی؛ مثلاً <code>/hero miy</code> هم Miya را پیدا می‌کند.

🎮 مینی‌اپ فارسی هم از دکمهٔ «باز کردن مینی‌اپ» در /start باز می‌شود.` + FOOTER;

  // ثبت هر کاربری که با ربات حرف می‌زند (برای شمارش و پیام همگانی)
  bot.use((ctx, next) => { trackUser(ctx); return next(); });

  bot.start(async (ctx) => {
    const kb = mainMenuKeyboard(isAdmin(ctx));
    const waNote = MINIAPP_URL
      ? '🎮 با دکمهٔ زیر مینی‌اپ فارسی را باز کن:'
      : '⚠️ مینی‌اپ هنوز روی هاست HTTPS تنظیم نشده است (MINIAPP_URL خالی است) — دستورهای زیر بدون مینی‌اپ هم کار می‌کنند.';
    const caption =
      `👋 سلام! به <b>پرشین MLBB</b> خوش آمدی.\n\nربات فارسی Mobile Legends: Bang Bang — هیروها بر اساس نقش، متا، کانتر، بیلد، آیتم، امبلم و جدول MPL، همه به فارسی و با دادهٔ زنده.\n\n${waNote}\n\nبرای راهنما: /help` +
      (isAdmin(ctx) ? '\n\n🛠️ تو مدیر ربات هستی — /admin برای پنل مدیریت.' : '') + FOOTER;
    // پیام ورود با لوگوی ربات (assets/logo.jpg) — اگر فایل نبود، فقط متن فرستاده می‌شود
    const logoPath = path.join(__dirname, '..', 'assets', 'logo.jpg');
    if (fs.existsSync(logoPath)) {
      try {
        await ctx.replyWithPhoto({ source: logoPath }, { caption, parse_mode: 'HTML', ...kb });
        return;
      } catch { /* بدون عکس ادامه بده */ }
    }
    await ctx.replyWithHTML(caption, kb);
  });

  bot.help((ctx) => ctx.replyWithHTML(helpText));

  // ---------- /hero ----------
  bot.command('hero', async (ctx) => {
    const q = ctx.message.text.replace(/^\/hero(@\S+)?\s*/i, '').trim();
    if (!q) return ctx.replyWithHTML('نام هیرو را بنویس؛ مثلاً: <code>/hero Miya</code>' + FOOTER);
    const hero = sd.findHero(q);
    if (!hero) {
      return ctx.replyWithHTML(esc(heroNotFoundText(q, sd.searchHeroes(q, 5))));
    }
    const id = Number(hero.mlid);
    const rankRes = await getRankList(7);
    const rank = rankRes.ok ? rankRes.all.find((r) => r.id === id) : null;
    const head = await heroHead(id);
    const skills = sd.heroPublic(hero).skills.slice(0, 4);
    let t = `🦸 <b>${esc(hero.hero_name)}</b>`;
    if (hero.class) t += ` — ${roleFa(hero.class)}`;
    if (hero.laning?.length) t += `\n🛤️ لین: ${laneFa(hero.laning)}`;
    if (rank) {
      t += `\n\n📊 <b>آمار زنده (۷ روز اخیر)</b>\nوین‌ریت: ${pct(rank.win)}\nبن‌ریت: ${pct(rank.ban)}\nپیک‌ریت: ${pct(rank.pick)}`;
    } else {
      t += '\n\n📊 آمار زندهٔ این هیرو فعلاً در دسترس نیست.';
    }
    if (skills.length) {
      t += '\n\n✨ <b>اسکیل‌ها:</b>';
      for (const s of skills) {
        t += `\n• <b>${esc(s.name)}</b>${s.type ? ` (${esc(s.type)})` : ''}`;
        if (s.description) t += `\n  ${esc(truncate(cleanText(s.description), 220))}`;
      }
    }
    t += `\n\nبرای کانتر: <code>/counter ${esc(hero.hero_name)}</code>\nبرای بیلد: <code>/build ${esc(hero.hero_name)}</code>`;
    t += FOOTER;
    if (head) {
      try { return await ctx.replyWithPhoto(head, { caption: t, parse_mode: 'HTML' }); } catch { /* بدون عکس ادامه بده */ }
    }
    return ctx.replyWithHTML(t);
  });

  // ---------- /heroes — لیست هیروها بر اساس نقش ----------
  function heroesRoleKeyboard() {
    const groups = sd.heroesByRole();
    const rows = groups.map((g) => [Markup.button.callback(`${g.emoji} ${g.en} (${faNum(g.count)})`, `heroes_role:${g.en}`)]);
    return Markup.inlineKeyboard(rows);
  }

  bot.command('heroes', async (ctx) => {
    const total = sd.heroes.length;
    return ctx.replyWithHTML(
      `🦸 <b>هیروها بر اساس نقش</b>\n\n${faNum(total)} هیرو در ۶ نقش — یکی را انتخاب کن:` + FOOTER,
      heroesRoleKeyboard(),
    );
  });

  bot.action(/^heroes_role:(.+)$/, async (ctx) => {
    const role = ctx.match[1];
    const g = sd.heroesByRole().find((x) => x.en === role);
    if (!g) return ctx.answerCbQuery('نقش پیدا نشد');
    await ctx.answerCbQuery();
    let t = `${g.emoji} <b>${g.en} (${faNum(g.count)})</b>\n`;
    for (const h of g.heroes) {
      t += `\n• <b>${esc(h.name)}</b> — ${laneFa(h.laning)}`;
    }
    t += `\n\nبرای جزئیات هر هیرو: <code>/hero نام</code>` + FOOTER;
    // پیام تلگرام حداکثر ۴۰۹۶ کاراکتر — لیست نقش‌ها زیر این حد است، ولی برای اطمینان تکه‌تکه می‌فرستیم
    for (let i = 0; i < t.length; i += 3500) {
      await ctx.replyWithHTML(t.slice(i, i + 3500));
    }
  });

  // ---------- /meta ----------
  bot.command('meta', async (ctx) => {
    const r = await getRankList(7);
    if (!r.ok) return ctx.replyWithHTML(`❌ گرفتن متا فعلاً ممکن نشد: ${esc(r.error)}` + FOOTER);
    const top = [...r.all].sort((a, b) => (b.win ?? 0) - (a.win ?? 0)).slice(0, 10);
    let t = '📊 <b>برترین هیروهای متا — ۷ روز اخیر (بر اساس وین‌ریت)</b>\n';
    top.forEach((h, i) => {
      t += `\n${faNum(i + 1)}. <b>${esc(h.name)}</b> — وین ${pct(h.win)} | بن ${pct(h.ban)} | پیک ${pct(h.pick)}`;
    });
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /counter ----------
  async function sendCounters(ctx, hero) {
    const id = Number(hero.mlid);
    const r = await roneGet(`/heroes/${id}/counters?days=7&size=10&index=1`);
    if (!r.ok) return ctx.replyWithHTML(`❌ گرفتن کانترها فعلاً ممکن نشد: ${esc(r.error)}` + FOOTER);
    const rec = r.records[0];
    if (!rec) return ctx.replyWithHTML('❌ برای این هیرو کانتر ثبت‌نشده‌ای پیدا نشد.' + FOOTER);
    const c = normCounterRecord(rec);
    const sorted = [...c.counters].filter((x) => x.delta != null).sort((a, b) => a.delta - b.delta).slice(0, 5);
    let t = `⚔️ <b>بهترین کانترهای ${esc(c.name || hero.hero_name)}</b>`;
    if (c.win != null) t += `\nوین‌ریت خودش: ${pct(c.win)} | بن‌ریت: ${pct(c.ban)}`;
    t += '\n\nاین هیروها وین‌ریت او را از همه بیشتر پایین می‌آورند:';
    if (!sorted.length) t += '\n— فعلاً کانتر مشخصی ثبت نشده است.';
    sorted.forEach((x, i) => {
      t += `\n${faNum(i + 1)}. <b>${esc(x.name)}</b> — ${pct(x.delta)} تغییر وین‌ریت`;
    });
    t += FOOTER;
    return ctx.replyWithHTML(t);
  }
  bot.command('counter', async (ctx) => {
    const q = ctx.message.text.replace(/^\/counter(@\S+)?\s*/i, '').trim();
    if (!q) return ctx.replyWithHTML('نام هیرو را بنویس؛ مثلاً: <code>/counter Miya</code>' + FOOTER);
    const hero = sd.findHero(q);
    if (!hero) return ctx.replyWithHTML(esc(heroNotFoundText(q, sd.searchHeroes(q, 5))));
    await ctx.replyWithHTML('⏳ در حال گرفتن کانترها…');
    return sendCounters(ctx, hero);
  });

  // ---------- /build ----------
  async function askLane(ctx, hero) {
    const kb = Markup.inlineKeyboard(
      LANES.map((l) => [Markup.button.callback(l.fa, `build:${hero.mlid}:${l.v}`)]),
    );
    return ctx.replyWithHTML(`🛠️ بیلد <b>${esc(hero.hero_name)}</b> برای کدام لین؟` + FOOTER, kb);
  }
  bot.command('build', async (ctx) => {
    const q = ctx.message.text.replace(/^\/build(@\S+)?\s*/i, '').trim();
    if (!q) return ctx.replyWithHTML('نام هیرو را بنویس؛ مثلاً: <code>/build Miya</code>' + FOOTER);
    const hero = sd.findHero(q);
    if (!hero) return ctx.replyWithHTML(esc(heroNotFoundText(q, sd.searchHeroes(q, 5))));
    return askLane(ctx, hero);
  });
  bot.action(/^build:(\d+):(exp|mid|gold|roam|jungle)$/, async (ctx) => {
    const [, idStr, lane] = ctx.match;
    const hero = sd.heroById(idStr);
    await ctx.answerCbQuery('⏳ در حال گرفتن بیلد…');
    const equipMap = await equipNameMap();
    const r = await roneGet(`/academy/heroes/${idStr}/builds?lane=${lane}`);
    if (!r.ok) {
      return ctx.replyWithHTML(`❌ گرفتن بیلد فعلاً ممکن نشد: ${esc(r.error)}\n\nلین باید یکی از این‌ها باشد: exp ،mid ،gold ،roam ،jungle` + FOOTER);
    }
    const rec = r.records[0];
    if (!rec) return ctx.replyWithHTML('❌ برای این هیرو و لین بیلدی پیدا نشد.' + FOOTER);
    const builds = normBuildRecord(rec, equipMap);
    const laneFa = (LANES.find((l) => l.v === lane) || {}).fa || lane;
    let t = `🛠️ <b>بیلد پیشنهادی ${esc(hero?.hero_name || '')}</b> — ${esc(laneFa)}`;
    if (!builds.length) t += '\n\n— بیلدی ثبت نشده است.';
    builds.slice(0, 3).forEach((b, i) => {
      t += `\n\n<b>بیلد ${faNum(i + 1)}</b> — وین ${pct(b.win)} | پیک ${pct(b.pick)}`;
      if (b.spell) t += `\n🪄 اسپل: ${esc(b.spell)}`;
      t += '\n🧰 آیتم‌ها: ' + (b.equipNames.length ? b.equipNames.map(esc).join(' ← ') : '—');
    });
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /items و /item ----------
  bot.command('items', async (ctx) => {
    const byCat = {};
    for (const it of sd.items) {
      const c = it.item_category || 'سایر';
      (byCat[c] = byCat[c] || []).push(it);
    }
    let t = `🧰 <b>آیتم‌ها (${faNum(sd.items.length)} آیتم)</b>\n`;
    for (const [cat, list] of Object.entries(byCat)) {
      t += `\n<b>${esc(cat)}:</b> ` + list.slice(0, 12).map((i) => esc(i.item_name)).join('، ');
      if (list.length > 12) t += ` و ${faNum(list.length - 12)} تای دیگر…`;
    }
    t += '\n\nبرای جزییات یک آیتم: <code>/item Berserker</code>';
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });
  bot.command('item', async (ctx) => {
    const q = ctx.message.text.replace(/^\/item(@\S+)?\s*/i, '').trim();
    if (!q) return ctx.replyWithHTML('نام آیتم را بنویس؛ مثلاً: <code>/item Berserker</code>' + FOOTER);
    const it = sd.findItem(q);
    if (!it) {
      const sug = sd.searchItems(q, 5);
      let t = `❌ آیتمی با نام «${q}» پیدا نشد.`;
      if (sug.length) t += '\n\nشاید منظورت این‌هاست:\n' + sug.map((x) => `• ${x.item_name}`).join('\n');
      return ctx.replyWithHTML(esc(t) + FOOTER);
    }
    const p = sd.itemPublic(it);
    let t = `🧰 <b>${esc(p.name)}</b>`;
    t += `\nدسته: ${esc(p.category)} | تیر: ${faNum(p.tier)}`;
    if (p.cost) t += ` | قیمت: ${faInt(p.cost)} طلا`;
    if (p.summary) t += `\nخلاصه: ${esc(p.summary)}`;
    const modEntries = Object.entries(p.modifiers || {});
    if (modEntries.length) {
      t += '\n\n📈 ویژگی‌ها:\n' + modEntries.map(([k, v]) => `• ${esc(k)}: ${faNum(v)}`).join('\n');
    }
    if (p.passives.length) {
      t += '\n\n✨ پسیو:';
      for (const ps of p.passives) t += `\n• <b>${esc(ps.name)}:</b> ${esc(truncate(cleanText(ps.desc), 300))}`;
    }
    if (p.actives.length) {
      t += '\n\n🪄 اکتیو:';
      for (const a of p.actives) t += `\n• <b>${esc(a.name)}:</b> ${esc(truncate(cleanText(a.desc), 300))}`;
    }
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /emblems ----------
  bot.command('emblems', async (ctx) => {
    let t = `🛡️ <b>امبلم‌ها (${faNum(sd.emblems.length)})</b>\n`;
    for (const e of sd.emblems) {
      t += `\n<b>${esc(e.emblem_name)}</b>${e.emblem_role ? ` (${esc(e.emblem_role)})` : ''}`;
      const mods = (e.modifiers || []).flatMap((m) => Object.entries(m).map(([k, v]) => `${k}: ${v}`));
      if (mods.length) t += `\n  ${esc(mods.join('، '))}`;
    }
    const tiers = sd.talents || {};
    const allTalents = [...(tiers.tier1 || []), ...(tiers.tier2 || []), ...(tiers.tier3 || [])];
    if (allTalents.length) {
      t += `\n\n⭐ <b>تلنت‌ها (${faNum(allTalents.length)}):</b>\n` + allTalents.map((x) => `• <b>${esc(x.name)}</b> — ${esc(sd.faTalent(x.id) || x.description)}`).join('\n');
    }
    t += '\n\n⚠️ اسپل‌ها (Battle Spells) از دادهٔ زنده خوانده می‌شوند؛ در مینی‌اپ تب «امبلم/اسپل» را ببین.';
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /wr ----------
  function wrNeeded(matchNow, wrNow, wrFuture) {
    const m = matchNow, cur = wrNow / 100, tgt = wrFuture / 100;
    if (tgt >= 1) return Infinity;
    const wins = m * cur;
    const n = (tgt * m - wins) / (1 - tgt);
    return Math.max(0, Math.ceil(n - 1e-9));
  }
  bot.command('wr', async (ctx) => {
    const args = ctx.message.text.replace(/^\/wr(@\S+)?\s*/i, '').trim().split(/\s+/).map(Number);
    if (args.length < 3 || args.some((x) => !Number.isFinite(x))) {
      return ctx.replyWithHTML('فرمت درست: <code>/wr 100 50 60</code>\nیعنی: ۱۰۰ مچ، وین‌ریت فعلی ۵۰٪، هدف ۶۰٪' + FOOTER);
    }
    const [m, now, fut] = args;
    if (fut <= now) return ctx.replyWithHTML('⚠️ وین‌ریت هدف باید بیشتر از وین‌ریت فعلی باشد.' + FOOTER);
    const r = await roneGet(`/addon/win-rate-calculator?match-now=${m}&wr-now=${now}&wr-future=${fut}`);
    let n = r.ok ? (r.raw?.required_no_lose_matches ?? r.raw?.data?.required_no_lose_matches) : null;
    if (n == null) n = wrNeeded(m, now, fut); // فالبک محاسبهٔ محلی
    let t = `🧮 <b>ماشین‌حساب وین‌ریت</b>\n\nمچ فعلی: ${faInt(m)}\nوین‌ریت فعلی: ${pct(now)}\nهدف: ${pct(fut)}\n\n✅ برای رسیدن به ${pct(fut)} باید <b>${faInt(n)} برد پشت سر هم</b> بدون باخت بگیری.`;
    if (!r.ok) t += '\n\n(محاسبهٔ محلی — سرویس زنده در دسترس نبود.)';
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /mpl ----------
  bot.command('mpl', async (ctx) => {
    const kb = Markup.inlineKeyboard(LEAGUES.map((l) => [Markup.button.callback(l.fa, `mpl:${l.v}`)]));
    return ctx.replyWithHTML('🏆 کدام لیگ MPL؟' + FOOTER, kb);
  });
  bot.action(/^mpl:(id|ph|my|kh)$/, async (ctx) => {
    const league = ctx.match[1];
    const name = (LEAGUES.find((l) => l.v === league) || {}).fa || league;
    await ctx.answerCbQuery('⏳ در حال گرفتن جدول…');
    const r = await roneGet(`/esports/${league}/standings`);
    if (!r.ok) {
      return ctx.replyWithHTML(`❌ جدول ${esc(name)} فعلاً در دسترس نیست: ${esc(r.error)}\n\nممکن است فصل این لیگ شروع نشده باشد یا سرویس بالادستی خطا بدهد.` + FOOTER);
    }
    const rows = r.records.map(normStanding).slice(0, 10);
    if (!rows.length) return ctx.replyWithHTML(`🏆 ${esc(name)}\n\nفعلاً ردیفی در جدول نیست.` + FOOTER);
    let t = `🏆 <b>جدول ${esc(name)}</b>\n`;
    rows.forEach((d) => {
      t += `\n${faNum(d.rank ?? 0)}. <b>${esc(d.team)}</b>${d.fullName ? ` (${esc(d.fullName)})` : ''}${d.wins != null ? ` — برد ${faNum(d.wins)}` : ''}${d.losses != null ? ` | باخت ${faNum(d.losses)}` : ''}${d.points != null ? ` | امتیاز ${faNum(d.points)}` : ''}${d.gameWins != null ? ` | گیم ${faNum(d.gameWins)}–${faNum(d.gameLosses)}` : ''}`;
    });
    t += FOOTER;
    return ctx.replyWithHTML(t);
  });

  // ---------- /player (ورود با کد تایید داخل بازی) ----------
  bot.command('player', (ctx) => {
    playerSessions.set(ctx.chat.id, { step: 'gameId' });
    return ctx.replyWithHTML(
      '👤 <b>اتصال پروفایل بازی</b>\n\nبرای دیدن آمار و مچ‌های خودت، اول Game ID (آیدی عددی بازی) را بفرست.\n\n⚠️ بعد از آن باید کد تاییدی را که داخل بازی می‌آید وارد کنی. توکن ورود فقط در حافظهٔ همین چت نگه داشته می‌شود و ذخیره نمی‌شود.\n\nبرای لغو، /cancel را بفرست.' + FOOTER,
    );
  });
  bot.command('cancel', (ctx) => {
    playerSessions.delete(ctx.chat.id);
    adminBroadcasts.delete(ctx.chat.id);
    return ctx.replyWithHTML('لغو شد.' + FOOTER);
  });
  bot.on('text', async (ctx, next) => {
    const text = (ctx.message.text || '').trim();
    // پیش‌نویس پیام همگانی مدیر — اول بررسی می‌شود تا با جریان /player قاطی نشود
    const bc = adminBroadcasts.get(ctx.chat.id);
    if (bc && isAdmin(ctx) && !text.startsWith('/')) {
      if (bc.step === 'text') {
        if (text.length > 4000) return ctx.replyWithHTML('⚠️ متن پیام همگانی حداکثر ۴۰۰۰ کاراکتر است. کوتاه‌تر بفرست.' + FOOTER);
        bc.text = text;
        bc.step = 'confirm';
        return ctx.replyWithHTML(
          `📣 <b>پیش‌نمایش پیام همگانی</b> — به ${faNum(users.size)} کاربر:\n\n${esc(text)}` + FOOTER,
          Markup.inlineKeyboard([
            [Markup.button.callback(`✅ ارسال به ${faNum(users.size)} کاربر`, 'admin_bc:send')],
            [Markup.button.callback('❌ لغو', 'admin_bc:cancel')],
          ]),
        );
      }
    }
    const s = playerSessions.get(ctx.chat.id);
    if (!s || text.startsWith('/')) return next();
    if (s.step === 'gameId') {
      if (!/^\d+$/.test(text)) return ctx.replyWithHTML('⚠️ Game ID فقط عدد است. دوباره بفرست.' + FOOTER);
      s.gameId = text;
      s.step = 'zoneId';
      return ctx.replyWithHTML('حالا Zone ID (آیدی سرور/زون) را بفرست. معمولاً ۴ رقم است؛ مثلاً 1234.' + FOOTER);
    }
    if (s.step === 'zoneId') {
      if (!/^\d+$/.test(text)) return ctx.replyWithHTML('⚠️ Zone ID فقط عدد است. دوباره بفرست.' + FOOTER);
      s.zoneId = text;
      s.step = 'sending';
      await ctx.replyWithHTML('⏳ در حال ارسال کد تایید به بازی… وارد بازی شو و کد را از صندوق پیام (اینباکس) بازی بردار.' + FOOTER);
      const r = await ronePost('/user/auth/send-vc', { game_id: s.gameId, zone_id: s.zoneId });
      // شکل دقیق body طبق OpenAPI ممکن است فرق کند؛ خطا را فارسی نشان می‌دهیم
      if (!r.ok) {
        playerSessions.delete(ctx.chat.id);
        return ctx.replyWithHTML(`❌ ارسال کد ممکن نشد: ${esc(r.error)}\n\nمطمئن شو Game ID و Zone ID درست‌اند. اگر باز هم نشد، ورود به پروفایل فعلاً از این مسیر ممکن نیست.` + FOOTER);
      }
      s.step = 'code';
      return ctx.replyWithHTML('✅ کد ارسال شد. کد تایید داخل بازی را اینجا بفرست.' + FOOTER);
    }
    if (s.step === 'code') {
      if (!/^\d{4,8}$/.test(text)) return ctx.replyWithHTML('⚠️ کد تایید عددی است (معمولاً ۴ تا ۸ رقم). دوباره بفرست.' + FOOTER);
      s.step = 'logging';
      await ctx.replyWithHTML('⏳ در حال ورود…' + FOOTER);
      const r = await ronePost('/user/auth/login', { game_id: s.gameId, zone_id: s.zoneId, verification_code: text });
      if (!r.ok) {
        s.step = 'code';
        return ctx.replyWithHTML(`❌ ورود ناموفق بود: ${esc(r.error)}\n\nاگر کد منقضی شده، با /player دوباره کد تازه بگیر.` + FOOTER);
      }
      const jwt = r.data?.token || r.data?.jwt || r.data?.access_token || (typeof r.data === 'string' ? r.data : null);
      if (!jwt) {
        playerSessions.delete(ctx.chat.id);
        return ctx.replyWithHTML('❌ ورود انجام شد ولی توکن برنگشت؛ پروفایل فعلاً قابل نمایش نیست.' + FOOTER);
      }
      s.jwt = jwt;
      s.step = 'done';
      const info = await roneGet('/user/info', { useCache: false, headers: { Authorization: `Bearer ${jwt}` } });
      const nick = info?.raw?.nickname || info?.raw?.data?.nickname || info?.raw?.username || '';
      return ctx.replyWithHTML(
        `✅ وارد شدی! پروفایلت متصل است.${nick ? `\n\n👤 ${esc(nick)}` : ''}\n\n⚠️ توکن ورود فقط در حافظهٔ همین چت است و بعد از ری‌استارت سرور پاک می‌شود.` + FOOTER,
      );
    }
    return next();
  });

  // ---------- /version ----------
  bot.command('version', async (ctx) => {
    const r = await roneGet('/academy/meta/version');
    if (!r.ok) return ctx.replyWithHTML(`❌ گرفتن نسخهٔ بازی ممکن نشد: ${esc(r.error)}` + FOOTER);
    const latest = r.records.find((rec) => rec?.data?.game_version);
    const v = latest?.data?.game_version || '؟';
    return ctx.replyWithHTML(`🎮 <b>نسخهٔ فعلی بازی:</b> ${esc(v)}` + FOOTER);
  });

  // ---------- /admin — پنل مدیریت (فقط مدیر) ----------
  function adminKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📊 وضعیت ربات', 'admin_status'), Markup.button.callback('👥 کاربران', 'admin_users')],
      [Markup.button.callback('🔄 بروزرسانی داده', 'admin_refresh'), Markup.button.callback('📝 لاگ‌های اخیر', 'admin_logs')],
      [Markup.button.callback('📣 پیام همگانی', 'admin_broadcast')],
      [Markup.button.callback('🔗 لینک مینی‌اپ', 'admin_miniapp')],
    ]);
  }

  bot.command('admin', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    return ctx.replyWithHTML('🛠️ <b>پنل مدیریت</b>\n\nیکی را انتخاب کن:' + FOOTER, adminKeyboard());
  });

  bot.action('menu_admin', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    return ctx.replyWithHTML('🛠️ <b>پنل مدیریت</b>\n\nیکی را انتخاب کن:' + FOOTER, adminKeyboard());
  });

  bot.action('admin_status', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const up = Math.floor((Date.now() - BOOT_TIME.getTime()) / 1000);
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
    const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
    let v = '؟';
    try {
      const r = await roneGet('/academy/meta/version');
      if (r.ok) v = r.records.find((rec) => rec?.data?.game_version)?.data?.game_version || '؟';
    } catch { /* نسخه خوانده نشد */ }
    return ctx.replyWithHTML(
      `📊 <b>وضعیت ربات</b>\n\n⏱️ زمان روشن بودن: ${faNum(h)} ساعت و ${faNum(m)} دقیقه\n🧠 حافظه: ${faNum(mem)} مگابایت\n🦸 هیروهای استاتیک: ${faNum(sd.heroes.length)}\n🧰 آیتم‌ها: ${faNum(sd.items.length)}\n🎮 نسخهٔ بازی: ${faNum(v)}\n👥 کاربران: ${faNum(users.size)}\n📡 حالت: polling (تلگرام)\n🔗 مینی‌اپ: ${esc(MINIAPP_URL || 'تنظیم نشده')}` + FOOTER,
    );
  });

  bot.action('admin_users', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const list = [...users.values()].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '')).slice(0, 10);
    let t = `👥 <b>کاربران ربات — ${faNum(users.size)} نفر</b>\n`;
    for (const u of list) {
      t += `\n• ${esc(u.name || '—')}${u.username ? ` (@${esc(u.username)})` : ''} — ${faNum((u.firstSeen || '').slice(0, 10))}`;
    }
    if (!list.length) t += '\n\nهنوز کسی ربات را استارت نکرده است.';
    return ctx.replyWithHTML(t + FOOTER);
  });

  bot.action('admin_refresh', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    const n = clearCache();
    return ctx.replyWithHTML(`🔄 کش دادهٔ زنده پاک شد (${faNum(n)} مورد). درخواست‌های بعدی مستقیم از سرور زنده خوانده می‌شوند.\n\nدیتای استاتیک (هیرو/آیتم) موقع بالا آمدن ربات خوانده می‌شود؛ برای تغییر آن ری‌استارت لازم است.` + FOOTER);
  });

  bot.action('admin_logs', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    let lines = [];
    try { lines = fs.readFileSync(path.join(__dirname, '..', 'logs', 'bot.log'), 'utf8').trim().split('\n').slice(-10); }
    catch { return ctx.replyWithHTML('📝 لاگی پیدا نشد.' + FOOTER); }
    return ctx.replyWithHTML(`📝 <b>۱۰ خط آخر لاگ</b>\n\n<pre>${esc(lines.join('\n')).slice(-3000)}</pre>` + FOOTER);
  });

  bot.action('admin_miniapp', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    return ctx.replyWithHTML(
      `🔗 <b>مینی‌اپ</b>\n\nآدرس فعلی: ${esc(MINIAPP_URL || 'تنظیم نشده')}\n\nبرای تغییر آن، فایل miniapp.url را عوض کن و ربات را ری‌استارت کن.` + FOOTER,
    );
  });

  bot.action('admin_broadcast', async (ctx) => {
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    adminBroadcasts.set(ctx.chat.id, { step: 'text' });
    return ctx.replyWithHTML(`📣 <b>پیام همگانی</b>\n\nمتن پیامی را که می‌خواهی به همهٔ کاربران ربات (${faNum(users.size)} نفر) برود بفرست.\n\nبرای لغو، /cancel را بفرست.` + FOOTER);
  });

  bot.action(/^admin_bc:(send|cancel)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const draft = adminBroadcasts.get(chatId);
    if (!requireAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery();
    if (!draft?.text) { adminBroadcasts.delete(chatId); return ctx.replyWithHTML('پیش‌نویسی برای ارسال نیست.' + FOOTER); }
    if (ctx.match[1] === 'cancel') { adminBroadcasts.delete(chatId); return ctx.replyWithHTML('❌ ارسال پیام همگانی لغو شد.' + FOOTER); }
    adminBroadcasts.delete(chatId);
    const targets = [...users.keys()].filter((id) => id !== String(ctx.from.id));
    let ok = 0, fail = 0;
    for (const id of targets) {
      try { await ctx.telegram.sendMessage(id, draft.text); ok++; }
      catch { fail++; }
      await new Promise((r) => setTimeout(r, 50));
    }
    return ctx.replyWithHTML(`✅ پیام همگانی ارسال شد.\n\n📬 موفق: ${faNum(ok)} نفر\n❌ ناموفق: ${faNum(fail)} نفر` + FOOTER);
  });

  // ---------- منوی شیشه‌ای ----------
  bot.action('menu_heroes', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.replyWithHTML(
      `🦸 <b>هیروها بر اساس نقش</b>\n\n${faNum(sd.heroes.length)} هیرو در ۶ نقش — یکی را انتخاب کن، یا نام هیرو را با دستور بفرست؛ مثلاً: <code>/hero Miya</code>` + FOOTER,
      heroesRoleKeyboard(),
    );
  });
  bot.action('menu_meta', async (ctx) => { await ctx.answerCbQuery(); return ctx.replyWithHTML('برای دیدن متا: /meta' + FOOTER); });
  bot.action('menu_counter', (ctx) => ctx.answerCbQuery().then(() => ctx.replyWithHTML('نام هیرو را بفرست؛ مثلاً: <code>/counter Gusion</code>' + FOOTER)));
  bot.action('menu_build', (ctx) => ctx.answerCbQuery().then(() => ctx.replyWithHTML('نام هیرو را بفرست؛ مثلاً: <code>/build Miya</code>' + FOOTER)));
  bot.action('menu_wr', (ctx) => ctx.answerCbQuery().then(() => ctx.replyWithHTML('فرمت: <code>/wr 100 50 60</code>' + FOOTER)));
  bot.action('menu_mpl', (ctx) => ctx.answerCbQuery().then(() => ctx.replyWithHTML('برای جدول MPL: /mpl' + FOOTER)));

  bot.catch((err, ctx) => {
    console.error('[bot] error', err);
    ctx.replyWithHTML('❌ خطایی پیش آمد؛ دوباره تلاش کن.' + FOOTER).catch(() => {});
  });

  return bot;
}

module.exports = { createBot, playerSessions };
