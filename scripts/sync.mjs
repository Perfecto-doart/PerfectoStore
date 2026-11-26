// Pulls products from Jinxxy + Gumroad and WIP images from a Discord channel,
// then writes data/products.json, data/wip.json and wip/*.jpg|png.
// Runs in GitHub Actions. Keys come from repository secrets, never from this file.
import fs from "node:fs/promises";

const { JINXXY_API_KEY, GUMROAD_TOKEN, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID } = process.env;
const JINXXY_STORE = "perfecto";            // jinxxy.com/<this>/...
const GUMROAD_STORE = "perfectodoart";      // <this>.gumroad.com
const WIP_COUNT = 12;                       // how many WIP images to show

const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };
const writeIfChanged = async (f, data) => {
  const next = JSON.stringify(data, null, 1) + "\n";
  if ((await fs.readFile(f, "utf8").catch(() => "")) !== next) { await fs.writeFile(f, next); console.log("updated", f); }
};

/* ---------- helpers ---------- */
const cleanName = n => String(n || "").trim()
  .replace(/\s*\|\s*VRChat\s+(Clothing|Outfit)\s*$/i, "")
  .replace(/\bfor for\b/gi, "For").replace(/\s+/g, " ");
const norm = n => cleanName(n).toLowerCase()
  .replace(/\|.*$/, "").replace(/\(audiolink\)|\bfree\b|\bavatar\b|\bvrchat\b|perfecto's|\bultra\b/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
const slugOf = u => (String(u || "").split("?")[0].replace(/\/+$/, "").split("/").pop() || "").toLowerCase();
const parseBases = name => {
  const m = cleanName(name).split(/\s+for\s+/i);
  if (m.length < 2) return [];
  return m.pop().replace(/\(.*?\)/g, "").replace(/\|.*$/, "").replace(/\bavatars?\b/gi, "")
    .split(/,|&|\band\b/i).map(s => s.trim()).filter(Boolean);
};
const RULES = [
  ["valentine", /valentine/i], ["christmas", /christmas|santa|new year|xmas/i],
  ["halloween", /halloween|pumpkin|ghost|mummy|\bfall\b|spooky/i], ["yoga", /yoga/i],
  ["summer", /beach|summer|swim/i], ["winter", /winter|puffer|snow/i], ["school", /school|blazer/i],
  ["sports", /sports/i], ["wrestler", /wrestl/i], ["robin", /robin ?hood/i], ["nurse", /nurse/i],
  ["pride", /pride/i], ["goth", /goth|laced/i], ["anime", /anime|furality|jjk|maki|cafe/i],
  ["fx", /lineart|reference|ref sheet|refrence|particle|follower/i]
];
const guessCollection = n => (RULES.find(([, r]) => r.test(n)) || ["special"])[0];
const pick = (o, ...paths) => {
  for (const p of paths) {
    const v = p.split(".").reduce((a, k) => a == null ? a : a[k], o);
    if (v != null && v !== "") return v;
  }
  return null;
};
const money = (cents, cur = "USD") => {
  const v = cents / 100, sym = cur === "USD" ? "$" : cur + " ";
  return sym + (Number.isInteger(v) ? v : v.toFixed(2));
};
const range = (nums, cur, inCents) => {
  const xs = nums.filter(n => typeof n === "number" && isFinite(n)).map(n => inCents ? n : n * 100);
  if (!xs.length) return null;
  const lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi === 0) return "Free";
  const a = lo === 0 ? "Free" : money(lo, cur);
  return lo === hi ? a : `${a}–${money(hi, cur).replace(/^\$/, "$")}`;
};

/* grab the og:image (cover picture) from a public product page */
async function pageImage(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (store-sync)" } });
    if (!r.ok) return "";
    const html = await r.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1].replace(/&amp;/g, "&") : "";
  } catch { return ""; }
}

/* ---------- Jinxxy ---------- */
async function fetchJinxxy() {
  if (!JINXXY_API_KEY) { console.log("No JINXXY_API_KEY, skipping Jinxxy"); return null; }
  const base = "https://api.creators.jinxxy.com/v1";
  const headers = { "x-api-key": JINXXY_API_KEY, accept: "application/json" };
  const get = async path => {
    for (let t = 0; t < 3; t++) {
      const r = await fetch(base + path, { headers });
      if (r.status === 429) { await sleep(Number(r.headers.get("retry-after") || 30) * 1000); continue; }
      if (!r.ok) throw new Error(`Jinxxy ${path} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
      return r.json();
    }
    throw new Error("Jinxxy rate limited");
  };
  const all = [];
  for (let page = 1; page <= 50; page++) {
    const j = await get(`/products?limit=100&page=${page}`);
    const list = Array.isArray(j) ? j : (j.results || j.data || j.products || j.items || []);
    if (page === 1) console.log("Jinxxy list fields:", Object.keys(j), "| item fields:", list[0] && Object.keys(list[0]));
    all.push(...list);
    const more = j.next || j.next_page || j.has_more || (j.page_count && page < j.page_count) || (j.total_pages && page < j.total_pages);
    if (!list.length || !more) break;
  }
  const out = [];
  for (const s of all) {
    let d = s;
    if (s.id) {
      try { const dj = await get(`/products/${encodeURIComponent(s.id)}`); d = { ...s, ...(dj.product || dj.data || dj) }; }
      catch (e) { console.log("detail failed for", s.id, e.message); }
      await sleep(550);
    }
    if (out.length === 0) console.log("Jinxxy sample product:", JSON.stringify(d).slice(0, 1500));
    const vis = String(pick(d, "visibility", "status") || "").toLowerCase();
    if (/private|hidden|draft|archiv|unlisted/.test(vis) || d.published === false) continue;
    const name = pick(d, "name", "title");
    if (!name) continue;
    let url = pick(d, "url", "url.href", "store_url", "product_url", "public_url");
    if (url && typeof url === "object") url = url.href || url.url || "";
    url = String(url || "");
    if (url && !/^https?:\/\//.test(url)) url = url.startsWith("/") ? "https://jinxxy.com" + url : "https://" + url;
    const slug = pick(d, "slug", "url_slug", "permalink");
    if (!url && slug) url = `https://jinxxy.com/${JINXXY_STORE}/${slug}`;
    const cur = pick(d, "currency_code", "currency") || "USD";
    const num = v => (v == null || v === "" || typeof v === "object") ? NaN : Number(v);
    const versions = Array.isArray(d.versions) ? d.versions : [];
    let prices = [num(pick(d, "base_price", "price", "price.amount")),
      ...versions.map(v => num(pick(v, "price", "base_price", "price.amount")))].filter(n => !isNaN(n));
    const pwyw = d.pwyw_pricing && typeof d.pwyw_pricing === "object" ? d.pwyw_pricing : null;
    if (pwyw && (pwyw.enabled ?? true)) { const m = num(pick(pwyw, "minimum_price", "min_price", "minimum")); if (!isNaN(m)) prices.push(m); }
    const inCents = prices.some(n => n >= 100 && Number.isInteger(n));
    let img = pick(d, "cover_image.url", "cover.url", "thumbnail_url", "image_url", "images.0.url");
    if (typeof img !== "string") img = "";
    if (!img && url) img = await pageImage(url);
    out.push({ name, url, price: range(prices, cur, inCents), image: img });
  }
  console.log("Jinxxy products:", out.length);
  return out;
}

/* ---------- Gumroad ---------- */
async function fetchGumroad() {
  if (!GUMROAD_TOKEN) { console.log("No GUMROAD_TOKEN, skipping Gumroad"); return null; }
  let next = "https://api.gumroad.com/v2/products", all = [];
  for (let n = 0; next && n < 20; n++) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${GUMROAD_TOKEN}` } });
    if (!r.ok) throw new Error(`Gumroad -> ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    if (!j.success) throw new Error("Gumroad: " + (j.message || "request failed"));
    all.push(...(j.products || []));
    next = j.next_page_url ? new URL(j.next_page_url, "https://api.gumroad.com").href : null;
  }
  console.log("Gumroad products from API (incl. unpublished):", all.length);
  const j = { products: all };
  const out = (j.products || []).filter(p => p.published !== false && !p.deleted).map(p => {
    const perma = p.custom_permalink || slugOf(p.short_url);
    return {
      name: p.name,
      url: perma ? `https://${GUMROAD_STORE}.gumroad.com/l/${perma}` : p.short_url,
      price: p.price === 0 ? "Free" : (p.formatted_price || null),
      image: p.thumbnail_url || p.preview_url || ""
    };
  });
  console.log("Gumroad products:", out.length);
  return out;
}

/* ---------- Discord WIP ---------- */
async function fetchDiscord() {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) { console.log("No Discord secrets, skipping WIP"); return null; }
  const r = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=100`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } });
  if (!r.ok) throw new Error(`Discord -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const msgs = await r.json(); // newest first
  const imgs = [];
  for (const m of msgs) for (const a of m.attachments || []) {
    const ext = ((a.filename || "").match(/\.(png|jpe?g|webp|gif)$/i) || [])[1];
    if (!ext && !(a.content_type || "").startsWith("image/")) continue;
    imgs.push({ id: a.id, url: a.url, ext: (ext || "png").toLowerCase().replace("jpeg", "jpg") });
  }
  const keep = imgs.slice(0, WIP_COUNT);
  await fs.mkdir("wip", { recursive: true });
  const wanted = new Set(keep.map(i => `${i.id}.${i.ext}`));
  for (const i of keep) {
    const f = `wip/${i.id}.${i.ext}`;
    if (await fs.access(f).then(() => true, () => false)) continue;
    const b = await fetch(i.url);
    if (b.ok) { await fs.writeFile(f, Buffer.from(await b.arrayBuffer())); console.log("saved", f); }
  }
  for (const f of await fs.readdir("wip")) if (f !== ".gitkeep" && !wanted.has(f)) await fs.unlink(`wip/${f}`);
  console.log("WIP images:", keep.length);
  return keep.map(i => ({ src: `wip/${i.id}.${i.ext}` }));
}

/* ---------- merge ---------- */
function merge(jx, gr, old, overrides) {
  const oldBy = new Map();
  for (const o of old) {
    if (o.jinxxy) oldBy.set("j:" + slugOf(o.jinxxy), o);
    if (o.gumroad) oldBy.set("g:" + slugOf(o.gumroad), o);
    oldBy.set("n:" + norm(o.name), o);
  }
  const grLeft = new Map(gr.map(g => [g, true]));
  const findGr = j => {
    const s = slugOf(j.url), n = norm(j.name);
    return gr.find(g => grLeft.get(g) && s && slugOf(g.url) === s) || gr.find(g => grLeft.get(g) && norm(g.name) === n);
  };
  const rows = [];
  for (const j of jx) {
    const g = findGr(j); if (g) grLeft.set(g, false);
    rows.push({ j, g });
  }
  for (const g of gr) if (grLeft.get(g)) rows.push({ j: null, g });

  return rows.map(({ j, g }) => {
    const src = j || g;
    const o = (j && oldBy.get("j:" + slugOf(j.url))) || (g && oldBy.get("g:" + slugOf(g.url))) || oldBy.get("n:" + norm(src.name)) || {};
    const name = cleanName(src.name);
    const ov = overrides[name] || overrides[slugOf(j?.url)] || overrides[slugOf(g?.url)] || {};
    const bases = o.bases?.length ? o.bases : parseBases(src.name);
    return {
      name,
      collection: ov.collection || o.collection || guessCollection(src.name),
      price: j?.price || g?.price || o.price || "",
      jinxxy: j?.url || "",
      gumroad: g?.url || "",
      image: j?.image || g?.image || o.image || "",
      bases: ov.bases || bases,
      ...(ov.hide ? { hide: true } : {})
    };
  });
}

/* ---------- run ---------- */
let failed = false;
const old = await readJSON("data/products.json", []);
const overrides = await readJSON("data/overrides.json", {});
try {
  const [jx, gr] = await Promise.all([fetchJinxxy(), fetchGumroad()]);
  if (jx || gr) {
    const merged = merge(jx || [], gr || [], old, overrides);
    if (merged.length) await writeIfChanged("data/products.json", merged);
    else console.log("Got 0 products, keeping the old list");
  }
} catch (e) { failed = true; console.error("Store sync failed, keeping the old product list:\n", e.message); }
try {
  const wip = await fetchDiscord();
  if (wip) await writeIfChanged("data/wip.json", wip);
} catch (e) { failed = true; console.error("Discord sync failed, keeping old WIP images:\n", e.message); }
if (failed) process.exitCode = 1;
