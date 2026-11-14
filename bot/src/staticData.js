// دیتای استاتیک آفلاین p3hndrx/MLBB-API (فایل‌های v1 در data/)
// hero-meta-final.json: ۱۳۴ هیرو (رکورد اول placeholder با hero_name="None" است — نادیده گرفته می‌شود)
// item-meta-final.json: ۸۹ آیتم | emblem-meta-final.json: ۷ امبلم | talent-meta-final.json: ۳ تلنت
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch (e) {
    console.warn('[static] cannot load', file, e.message);
    return { data: [] };
  }
}

const heroFile = loadJson('hero-meta-final.json');
const itemFile = loadJson('item-meta-final.json');
const emblemFile = loadJson('emblem-meta-final.json');
const talentFile = loadJson('talent-meta-final.json');
// ترجمهٔ فارسی توضیحات (data/fa-overrides.json) — اگر نباشد، متن انگلیسی نشان داده می‌شود
const faFile = loadJson('fa-overrides.json');
// بیلد کامل ۶ آیتمی از mlbb.io (data/builds-full.json) — اگر نباشد، خالی است
const fullBuildsFile = loadJson('builds-full.json');
const fullBuilds = (fullBuildsFile && fullBuildsFile.heroes) || {};
// اخبار و تیرلیست (data/news.json + data/tierlist.json) — اگر نباشند، خالی است
const newsFile = loadJson('news.json');
const tierlistFile = loadJson('tierlist.json');
const news = { patchNotes: (newsFile && newsFile.patch_notes) || [], wikiRecent: (newsFile && newsFile.wiki_recent) || [] };
const tierlist = {
  month: (tierlistFile && tierlistFile.month) || null,
  tiers: (tierlistFile && tierlistFile.tiers) || {},
  counts: (tierlistFile && tierlistFile.counts) || {},
};
const FA = {
  heroSkills: (faFile && faFile.heroSkills) || {},
  items: (faFile && faFile.items) || {},
  talents: (faFile && faFile.talents) || {},
  spells: (faFile && faFile.spells) || {},
};
function faSkill(heroId, skillName) { return FA.heroSkills[`${heroId}|${norm(skillName)}`] || null; }
function faItem(itemId, name) { return FA.items[`${itemId}|${norm(name)}`] || null; }
function faTalent(id) { return FA.talents[String(id)] || null; }
function faSpell(name) { return FA.spells[norm(name)] || null; }

const heroes = (heroFile.data || []).filter((h) => h && h.hero_name && h.hero_name !== 'None');
const items = itemFile.data || [];
const emblems = emblemFile.data || [];
const talents = talentFile.data || {}; // { tier1: [...], tier2: [...], tier3: [...] }

console.log(`[static] heroes=${heroes.length} items=${items.length} emblems=${emblems.length} news=${news.patchNotes.length + news.wikiRecent.length} tierlist=${Object.values(tierlist.counts).reduce((a, b) => a + b, 0)} revdate=${heroFile.revdate || '?'}`);

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

// جست‌وجوی هیرو: نام دقیق، شروع‌شونده، شامل‌شونده؛ اگر نبود نزدیک‌ترین‌ها
function searchHeroes(query, limit = 5) {
  const q = norm(query);
  if (!q) return [];
  const scored = heroes.map((h) => {
    const name = norm(h.hero_name);
    let score = -1;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else {
      const d = levenshtein(name, q);
      if (d <= 2 && q.length >= 3) score = 40 - d * 5;
    }
    return { h, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.h);
}

function findHero(query) {
  const r = searchHeroes(query, 1);
  return r[0] || null;
}

function heroById(id) {
  const n = String(id);
  return heroes.find((h) => String(h.mlid) === n || String(h.id) === n || norm(h.hero_name) === norm(id)) || null;
}

function searchItems(query, limit = 5) {
  const q = norm(query);
  if (!q) return items.slice(0, limit);
  const scored = items.map((it) => {
    const name = norm(it.item_name);
    let score = -1;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else {
      const d = levenshtein(name, q);
      if (d <= 3 && q.length >= 4) score = 40 - d * 5;
    }
    return { it, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.it);
}

function findItem(query) {
  const r = searchItems(query, 1);
  return r[0] || null;
}

function heroPublic(h) {
  return {
    id: h.mlid ? Number(h.mlid) : null,
    name: h.hero_name,
    class: h.class || '',
    laning: h.laning || [],
    portrait: h.portrait || '',
    hero_icon: h.hero_icon || '',
    skills: (h.skills || []).map((s) => ({
      name: s.skill_name,
      type: s.type,
      cooldown: s.cooldown,
      manacost: s.manacost,
      description: faSkill(h.mlid, s.skill_name) || s.description,
      icon: s.skill_icon,
      tags: s.tags || [],
    })),
  };
}

function itemPublic(it) {
  const d0 = (it.data && it.data[0]) || {};
  const mods = {};
  for (const m of d0.modifiers || []) Object.assign(mods, m);
  const passives = [
    ...((d0.passive || []).filter((p) => p.passive_name && p.passive_name !== 'null').map((p) => ({ name: p.passive_name, desc: faItem(it.id, p.passive_name) || p.description }))),
    ...((d0.unique_passive || []).filter((p) => p.unique_passive_name && p.unique_passive_name !== 'null').map((p) => ({ name: p.unique_passive_name, desc: faItem(it.id, p.unique_passive_name) || p.description }))),
  ];
  const actives = (d0.active || []).filter((a) => a.active_name && a.active_name !== 'null').map((a) => ({ name: a.active_name, desc: faItem(it.id, a.active_name) || a.description }));
  return {
    id: it.id,
    name: it.item_name,
    tier: it.item_tier,
    category: it.item_category,
    cost: d0.cost || null,
    summary: d0.summary || '',
    modifiers: mods,
    passives,
    actives,
  };
}

const { ROLES, roleList } = require('./fa');

// هیروها دسته‌بندی‌شده بر اساس نقش — هر هیروی دورنقشه در هر دو گروه می‌آید
// برمی‌گرداند: [{ en, fa, emoji, count, heroes: [heroPublic...] }, ...] به ترتیب ROLES
function heroesByRole() {
  return ROLES.map((r) => {
    const list = heroes
      .filter((h) => roleList(h.class).includes(r.en))
      .sort((a, b) => a.hero_name.localeCompare(b.hero_name))
      .map(heroPublic);
    return { en: r.en, fa: r.fa, emoji: r.emoji, count: list.length, heroes: list };
  });
}

module.exports = {
  heroes, items, emblems, talents, fullBuilds, news, tierlist,
  heroRevdate: heroFile.revdate || null,
  itemRevdate: itemFile.revdate || null,
  searchHeroes, findHero, heroById,
  searchItems, findItem,
  heroPublic, itemPublic,
  heroesByRole,
  faSkill, faItem, faTalent, faSpell,
  faCounts: {
    heroSkills: Object.keys(FA.heroSkills).length,
    items: Object.keys(FA.items).length,
    talents: Object.keys(FA.talents).length,
    spells: Object.keys(FA.spells).length,
  },
};
