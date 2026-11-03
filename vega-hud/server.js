// VEGA HUD — 依存ゼロのニュースHUDサーバー (Node.js 18+)
// 使い方: node server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const LAT = process.env.LAT || '35.6812';   // 既定: 東京駅
const LON = process.env.LON || '139.7671';
const CITY = process.env.CITY || 'TOKYO';
const CACHE_MS = 5 * 60 * 1000;
const FORCE_DEMO = process.env.DEMO === '1';

const gnews = (topic) =>
  `https://news.google.com/rss/headlines/section/topic/${topic}?hl=ja&gl=JP&ceid=JP:ja`;

// フィード設定。URLは自由に差し替え可。
const FEEDS = {
  top: [
    { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml' },
    { name: 'Google News', url: 'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja' },
  ],
  economy: [
    { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat5.xml' },
    { name: 'Google News', url: gnews('BUSINESS') },
  ],
  world: [
    { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
    { name: 'Google News', url: gnews('WORLD') },
  ],
  tech: [
    { name: 'ITmedia', url: 'https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml' },
    { name: 'Google News', url: gnews('TECHNOLOGY') },
  ],
  science: [
    { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat3.xml' },
    { name: 'Google News', url: gnews('SCIENCE') },
  ],
};

// ---------- RSS / Atom の最小パーサ ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function clean(s) {
  // エンティティ化されたHTMLにも対応するため decode → タグ除去 → decode
  return decode(
    decode(s || '')
      .replace(/<\/?(?:a|b|i|u|em|strong|span|font|small|sup|sub)\b[^>]*>/gi, '') // インライン要素は詰める
      .replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function parseFeed(xml, feedName) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi)
    || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let title = clean(tag(b, 'title'));
    let link = clean(tag(b, 'link'));
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? decode(m[1]) : '';
    }
    const dateStr = clean(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const t = Date.parse(dateStr);
    let source = feedName;
    const publisher = clean(tag(b, 'source'));
    if (publisher) {
      source = publisher;
      // Google News は「見出し - 媒体名」形式なので末尾を落とす
      const suffix = ` - ${publisher}`;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    }
    let desc = clean(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content'));
    if (desc === title || desc.startsWith(title)) desc = '';
    return {
      title,
      link: /^https?:\/\//i.test(link) ? link : '',
      time: Number.isFinite(t) ? t : null,
      source,
      desc: desc.slice(0, 400),
    };
  }).filter((i) => i.title);
}

// ---------- 取得とキャッシュ ----------
const cache = new Map();
async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'VegaHUD/1.0 (personal news dashboard)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function demoItems(cat) {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, i) => ({
    title: `【デモ】${cat.toUpperCase()} サンプル見出し ${String(i + 1).padStart(2, '0')} — 実フィードに接続できないため表示中`,
    link: '',
    time: now - i * 17 * 60 * 1000,
    source: 'DEMO',
    desc: 'これはダミーデータです。インターネットに接続した環境で node server.js を実行すると実際のニュースに置き換わります。',
  }));
}

async function getNews(cat) {
  const hit = cache.get(cat);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, cached: true };

  const started = Date.now();
  const feeds = FEEDS[cat];
  const results = FORCE_DEMO
    ? feeds.map(() => ({ status: 'rejected', reason: new Error('DEMO=1') }))
    : await Promise.allSettled(feeds.map((f) => fetchText(f.url).then((x) => parseFeed(x, f.name))));

  const sources = feeds.map((f, i) => ({
    name: f.name,
    ok: results[i].status === 'fulfilled',
    count: results[i].status === 'fulfilled' ? results[i].value.length : 0,
    error: results[i].status === 'rejected' ? String(results[i].reason?.message || results[i].reason) : null,
  }));

  const seen = new Set();
  let items = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((i) => {
      const key = i.title.replace(/\s/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, 40);

  const demo = items.length === 0;
  if (demo) items = demoItems(cat);

  const data = { category: cat, items, sources, demo, fetchedAt: Date.now(), latencyMs: Date.now() - started };
  if (!demo) cache.set(cat, { at: Date.now(), data });
  return { ...data, cached: false };
}

async function getWeather() {
  const hit = cache.get('weather');
  if (hit && Date.now() - hit.at < CACHE_MS * 2) return hit.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
    + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1';
  const j = JSON.parse(await fetchText(url));
  const data = {
    city: CITY,
    temp: j.current?.temperature_2m,
    humidity: j.current?.relative_humidity_2m,
    wind: j.current?.wind_speed_10m,
    code: j.current?.weather_code,
    max: j.daily?.temperature_2m_max?.[0],
    min: j.daily?.temperature_2m_min?.[0],
    rain: j.daily?.precipitation_probability_max?.[0],
  };
  cache.set('weather', { at: Date.now(), data });
  return data;
}

// ---------- HTTP ----------
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/news') {
      const cat = url.searchParams.get('cat') || 'top';
      if (!FEEDS[cat]) return sendJSON(res, 400, { error: 'unknown category' });
      return sendJSON(res, 200, await getNews(cat));
    }
    if (url.pathname === '/api/weather') {
      if (FORCE_DEMO) return sendJSON(res, 503, { error: 'demo mode' });
      return sendJSON(res, 200, await getWeather());
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    sendJSON(res, 502, { error: String(e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`VEGA HUD online → http://localhost:${PORT}${FORCE_DEMO ? '  (DEMO MODE)' : ''}`);
});
