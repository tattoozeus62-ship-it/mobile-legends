// سرور MLBB — یک پروسه: Express (سرو مینی‌اپ + پراکسی /api/* به Rone با کش) + ربات Telegraf با polling
// اگر BOT_TOKEN نباشد، فقط وب بالا می‌آید و ربات رد می‌شود (کرش نمی‌کند).
// ⚠️ مینی‌اپ تلگرام فقط روی HTTPS باز می‌شود؛ WispByte روی HTTP است، پس public/ باید
// جداگانه روی هاست HTTPS رایگان (Cloudflare Pages یا GitHub Pages) برود — رک. README-fa.md
try { require('dotenv').config(); } catch { /* dotenv اختیاری است؛ env را می‌شود مستقیم ست کرد */ }
const path = require('path');
const express = require('express');
const { roneGet, ronePost, normHeroRecord, normRankRecord, normCounterRecord, normBuildRecord, normStanding, equipNameMap } = require('./rone');
const sd = require('./staticData');
const { faNum, pct } = require('./fa');
const { createBot } = require('./bot');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, status, error) => res.status(status || 502).json({ ok: false, error });

// ---------- سلامت و نسخه ----------
app.get('/api/health', (req, res) => ok(res, {
  status: 'ok',
  time: new Date().toISOString(),
  heroes_static: sd.heroes.length,
  items_static: sd.items.length,
  bot: process.env.BOT_TOKEN ? 'configured' : 'no-token',
  miniapp: process.env.MINIAPP_URL || null,
}));

app.get('/api/version', async (req, res) => {
  const r = await roneGet('/academy/meta/version');
  if (!r.ok) return fail(res, 502, r.error);
  const latest = r.records.find((rec) => rec?.data?.game_version);
  return ok(res, { game_version: latest?.data?.game_version || null, records: r.records.slice(0, 5).map((x) => x?.data?.game_version).filter(Boolean) });
});

// ---------- هیروها ----------
app.get('/api/heroes', async (req, res) => {
  const size = Math.min(Math.max(parseInt(req.query.size) || 20, 1), 140);
  const index = Math.max(parseInt(req.query.index) || 1, 1);
  const q = (req.query.q || '').trim();
  // جست‌وجو اول از دیتای استاتیک (نام/کلاس/لین)
  if (q) {
    const hits = sd.searchHeroes(q, size).map(sd.heroPublic);
    if (hits.length) return ok(res, { source: 'static', heroes: hits });
  }
  const r = await roneGet(`/heroes?size=${size}&index=${index}`);
  if (!r.ok) {
    // فالبک استاتیک
    const page = sd.heroes.slice((index - 1) * size, index * size).map(sd.heroPublic);
    return ok(res, { source: 'static-fallback', error: r.error, heroes: page });
  }
  return ok(res, { source: 'live', heroes: r.records.map(normHeroRecord) });
});

app.get('/api/heroes/:id', async (req, res) => {
  const id = req.params.id;
  const st = sd.heroById(id);
  const r = await roneGet(`/heroes/${id}`);
  const rank = await roneGet('/heroes/rank?days=7&size=140&index=1');
  const rankRec = rank.ok ? rank.records.map(normRankRecord).find((x) => String(x.id) === String(st?.mlid || id)) : null;
  if (!r.ok && !st) return fail(res, 502, r.error);
  const rec = r.records?.[0];
  const detail = rec?.data || {};
  const heroData = detail.hero?.data || {};
  return ok(res, {
    source: r.ok ? 'live' : 'static-fallback',
    hero: {
      id: st?.mlid ? Number(st.mlid) : (detail.hero_id ?? null),
      name: heroData.name || st?.hero_name || '',
      head: heroData.head || null,
      head_big: detail.head_big || null,
      class: st?.class || '',
      laning: st?.laning || [],
      portrait: st?.portrait || '',
      skills: st ? sd.heroPublic(st).skills : [],
      rank: rankRec || null,
      raw: undefined,
    },
  });
});

// ---------- متا ----------
app.get('/api/meta', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const size = Math.min(Math.max(parseInt(req.query.size) || 15, 1), 50);
  const r = await roneGet(`/heroes/rank?days=${days}&size=140&index=1`);
  if (!r.ok) return fail(res, 502, r.error);
  const all = r.records.map(normRankRecord).filter((x) => x.id != null);
  const byWin = [...all].sort((a, b) => (b.win ?? 0) - (a.win ?? 0)).slice(0, size);
  const byBan = [...all].sort((a, b) => (b.ban ?? 0) - (a.ban ?? 0)).slice(0, size);
  return ok(res, { days, byWin, byBan });
});

// ---------- کانترها و بیلد ----------
app.get('/api/counters/:id', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 90);
  const r = await roneGet(`/heroes/${req.params.id}/counters?days=${days}&size=10&index=1`);
  if (!r.ok) return fail(res, 502, r.error);
  const rec = r.records[0];
  if (!rec) return fail(res, 404, 'کانتر پیدا نشد');
  const c = normCounterRecord(rec);
  c.counters = [...c.counters].filter((x) => x.delta != null).sort((a, b) => b.delta - a.delta);
  return ok(res, { counters: c });
});

app.get('/api/builds/:id', async (req, res) => {
  const lane = (req.query.lane || '').toLowerCase();
  const valid = ['exp', 'mid', 'gold', 'roam', 'jungle'];
  if (!valid.includes(lane)) {
    return fail(res, 400, 'lane باید یکی از این‌ها باشد: ' + valid.join('، '));
  }
  const equipMap = await equipNameMap();
  const r = await roneGet(`/academy/heroes/${req.params.id}/builds?lane=${lane}`);
  if (!r.ok) return fail(res, 502, r.error);
  const rec = r.records[0];
  if (!rec) return fail(res, 404, 'بیلدی پیدا نشد');
  return ok(res, {
    hero_name: rec.data?.hero_name || null,
    heroid: rec.data?.heroid ?? null,
    lane,
    builds: normBuildRecord(rec, equipMap),
  });
});

// ---------- آیتم، امبلم، اسپل ----------
app.get('/api/items', (req, res) => {
  const q = (req.query.q || '').trim();
  const list = q ? sd.searchItems(q, 50) : sd.items;
  return ok(res, { source: 'static', revdate: sd.itemRevdate, items: list.map(sd.itemPublic) });
});

app.get('/api/item', (req, res) => {
  const q = (req.query.name || '').trim();
  if (!q) return fail(res, 400, 'پارامتر name لازم است؛ مثلاً /api/item?name=Berserker');
  const it = sd.findItem(q);
  if (!it) return fail(res, 404, 'آیتم پیدا نشد');
  return ok(res, { item: sd.itemPublic(it) });
});

app.get('/api/emblems', async (req, res) => {
  // اسپل‌های زنده از Rone؛ امبلم و تلنت از دیتای استاتیک
  const spellsRes = await roneGet('/academy/spells?size=20&index=1');
  const spells = spellsRes.ok ? spellsRes.records.map((rec) => {
    const d = rec?.data?.__data || rec?.data || {};
    const name = d.skillname || d.name || '';
    const desc = (d.skilldesc || '').replace(/<[^>]+>/g, '');
    return { name, desc: sd.faSpell(name) || desc, icon: rec?.data?.skillicon || null };
  }).filter((s) => s.name) : [];
  const mapTalents = (tiers) => {
    const out = {};
    for (const [k, arr] of Object.entries(tiers || {})) {
      out[k] = (arr || []).map((t) => ({ ...t, description: sd.faTalent(t.id) || t.description }));
    }
    return out;
  };
  return ok(res, {
    emblems: sd.emblems,
    talents: mapTalents(sd.talents),
    spells,
    spells_error: spellsRes.ok ? null : spellsRes.error,
  });
});

app.get('/api/spells', async (req, res) => {
  const r = await roneGet('/academy/spells?size=20&index=1');
  if (!r.ok) return fail(res, 502, r.error);
  const spells = r.records.map((rec) => {
    const d = rec?.data?.__data || rec?.data || {};
    const name = d.skillname || d.name || '';
    const desc = (d.skilldesc || '').replace(/<[^>]+>/g, '');
    return { name, desc: sd.faSpell(name) || desc };
  }).filter((s) => s.name);
  return ok(res, { spells });
});

// ---------- ماشین‌حساب وین‌ریت ----------
app.get('/api/wr', async (req, res) => {
  const m = Number(req.query['match-now']);
  const now = Number(req.query['wr-now']);
  const fut = Number(req.query['wr-future']);
  if (![m, now, fut].every(Number.isFinite)) {
    return fail(res, 400, 'هر سه پارامتر الزامی‌اند: match-now و wr-now و wr-future');
  }
  const r = await roneGet(`/addon/win-rate-calculator?match-now=${m}&wr-now=${now}&wr-future=${fut}`, { useCache: false });
  if (r.ok && r.raw?.required_no_lose_matches != null) {
    return ok(res, { match_now: m, wr_now: now, wr_future: fut, required_no_lose_matches: r.raw.required_no_lose_matches, source: 'live' });
  }
  // فالبک محاسبهٔ محلی
  if (fut <= now) return fail(res, 400, 'وین‌ریت هدف باید بیشتر از فعلی باشد');
  const n = Math.max(0, Math.ceil(((fut / 100) * m - (now / 100) * m) / (1 - fut / 100) - 1e-9));
  return ok(res, { match_now: m, wr_now: now, wr_future: fut, required_no_lose_matches: n, source: 'local-fallback' });
});

// ---------- MPL ----------
app.get('/api/mpl/:league/standings', async (req, res) => {
  const league = req.params.league.toLowerCase();
  if (!['id', 'ph', 'my', 'kh'].includes(league)) return fail(res, 400, 'لیگ باید یکی از id ،ph ،my ،kh باشد');
  const r = await roneGet(`/esports/${league}/standings`);
  if (!r.ok) return fail(res, 502, r.error + ' — ممکن است فصل این لیگ شروع نشده باشد یا سرویس بالادستی خطا بدهد.');
  const standings = (r.raw?.standings || r.records || []).map(normStanding);
  return ok(res, { league, standings });
});
app.get('/api/mpl/:league/schedule', async (req, res) => {
  const league = req.params.league.toLowerCase();
  if (!['id', 'ph', 'my', 'kh'].includes(league)) return fail(res, 400, 'لیگ باید یکی از id ،ph ،my ،kh باشد');
  const r = await roneGet(`/esports/${league}/schedule`);
  if (!r.ok) return fail(res, 502, r.error);
  return ok(res, { league, weeks: r.raw?.weeks || r.records || [] });
});

// ---------- پروفایل بازیکن (JWT در حافظهٔ مرورگر مینی‌اپ نگه داشته می‌شود) ----------
app.post('/api/user/send-vc', async (req, res) => {
  const { game_id, zone_id } = req.body || {};
  if (!game_id || !zone_id) return fail(res, 400, 'game_id و zone_id الزامی‌اند');
  const r = await ronePost('/user/auth/send-vc', { game_id, zone_id });
  if (!r.ok) return fail(res, 502, r.error);
  return ok(res, { sent: true, data: r.data });
});
app.post('/api/user/login', async (req, res) => {
  const { game_id, zone_id, verification_code } = req.body || {};
  if (!game_id || !zone_id || !verification_code) return fail(res, 400, 'game_id و zone_id و verification_code الزامی‌اند');
  const r = await ronePost('/user/auth/login', { game_id, zone_id, verification_code });
  if (!r.ok) return fail(res, 502, r.error);
  return ok(res, { data: r.data });
});
app.get('/api/user/info', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'اول با /api/user/login وارد شو و توکن را بفرست');
  const r = await roneGet('/user/info', { useCache: false, headers: { Authorization: auth } });
  if (!r.ok) return fail(res, 502, r.error);
  return ok(res, { info: r.raw });
});

// ریشه: مینی‌اپ
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`[web] listening on :${PORT} — miniapp: ${process.env.MINIAPP_URL || '(not set)'}`);
});

// ربات (فقط اگر توکن باشد)
// نکته: launch() تا وقتی polling ادامه دارد resolve نمی‌شود، پس «polling started»
// را با onLaunch می‌گیریم که بعد از getMe و قبل از شروع polling صدا می‌شود.
const bot = createBot();
if (bot) {
  bot.launch({}, async () => {
    console.log('[bot] polling started');
    // دکمهٔ «Open App» پایین چت (کنار جای تایپ) — مستقیم مینی‌اپ را باز می‌کند
    if (process.env.MINIAPP_URL) {
      try {
        const setOk = await bot.telegram.setChatMenuButton({ menuButton: { type: 'web_app', text: 'Open App', web_app: { url: process.env.MINIAPP_URL } } });
        const cur = await bot.telegram.getChatMenuButton();
        console.log('[bot] menu button set:', setOk, 'current:', JSON.stringify(cur));
      } catch (e) { console.error('[bot] menu button failed:', e.message); }
    }
  }).catch((e) => console.error('[bot] launch failed:', e.message));
}

process.once('SIGINT', () => { bot?.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot?.stop('SIGTERM'); process.exit(0); });
