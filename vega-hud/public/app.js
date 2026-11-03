(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 5 * 60 * 1000;
  const CAT_LABEL = { top: '主要', economy: '経済', world: '国際', tech: 'テック', science: '科学' };
  const WMO = {
    0: '快晴', 1: '晴れ', 2: '一部曇り', 3: '曇り', 45: '霧', 48: '着氷性の霧',
    51: '弱い霧雨', 53: '霧雨', 55: '強い霧雨', 61: '小雨', 63: '雨', 65: '強い雨',
    66: '着氷性の雨', 67: '強い着氷性の雨', 71: '小雪', 73: '雪', 75: '大雪', 77: '霧雪',
    80: 'にわか雨', 81: '強いにわか雨', 82: '激しいにわか雨', 85: 'にわか雪', 86: '強いにわか雪',
    95: '雷雨', 96: '雹を伴う雷雨', 99: '激しい雹を伴う雷雨',
  };

  const state = { cat: 'top', items: [], sel: 0, nextSync: 0, bootAt: Date.now(), listening: false, demo: false, speechGen: 0 };

  // ---------- ユーティリティ ----------
  const pad = (n) => String(n).padStart(2, '0');
  function ago(t) {
    if (!t) return '';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'たった今';
    if (m < 60) return `${m}分前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}時間前`;
    return `${Math.floor(h / 24)}日前`;
  }
  function fmtTime(t) {
    if (!t) return '';
    const d = new Date(t);
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function setChip(id, cls, label) {
    const c = $(id);
    c.className = 'chip ' + (cls || '');
    if (label) c.lastChild.textContent = label;
  }

  // ---------- タイプライター ----------
  let typeTimer = null;
  function say(text) {
    clearInterval(typeTimer);
    const out = $('say');
    out.textContent = '';
    let i = 0;
    typeTimer = setInterval(() => {
      out.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 22);
  }

  // ---------- 音声合成 ----------
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let jaVoice = null;
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
    jaVoice = vs.find((v) => /google|kyoko|otoya|nanami|haruka/i.test(v.name)) || vs[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  function speak(text, { queue = false } = {}) {
    if (!synth) { say('この環境では音声合成が使えません'); return Promise.resolve(); }
    if (!queue) { synth.cancel(); state.speechGen++; }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (jaVoice) u.voice = jaVoice;
      u.rate = 1.05;
      u.pitch = 0.95;
      u.onstart = () => $('core').classList.add('speaking');
      u.onend = u.onerror = () => {
        if (!synth.speaking) $('core').classList.remove('speaking');
        resolve();
      };
      synth.speak(u);
    });
  }
  function stopSpeaking() { state.speechGen++; if (synth) synth.cancel(); $('core').classList.remove('speaking'); }

  // ---------- 描画 ----------
  function buildTicks() {
    const g = $('ticks');
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const major = i % 6 === 0;
      const r1 = 140, r2 = major ? 158 : 150;
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', (Math.cos(a) * r1).toFixed(2));
      l.setAttribute('y1', (Math.sin(a) * r1).toFixed(2));
      l.setAttribute('x2', (Math.cos(a) * r2).toFixed(2));
      l.setAttribute('y2', (Math.sin(a) * r2).toFixed(2));
      if (major) l.setAttribute('class', 'major');
      g.appendChild(l);
    }
  }

  function renderList() {
    const list = $('list');
    list.replaceChildren();
    if (!state.items.length) {
      list.appendChild(el('li', 'empty', 'NO SIGNAL — 記事がありません'));
      return;
    }
    state.items.forEach((it, i) => {
      const li = el('li');
      li.style.animationDelay = `${Math.min(i, 20) * 25}ms`;
      li.appendChild(el('div', null)).append(
        el('div', 't', it.title),
        (() => { const m = el('div', 'm'); m.append(el('span', 'src', it.source), el('span', null, ago(it.time))); return m; })(),
      );
      li.addEventListener('click', () => select(i, true));
      list.appendChild(li);
    });
    highlight();
  }

  function highlight() {
    const lis = $('list').children;
    [...lis].forEach((li, i) => li.classList.toggle('sel', i === state.sel));
    lis[state.sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderDetail() {
    const it = state.items[state.sel];
    if (!it) return;
    $('d-source').textContent = it.source.toUpperCase();
    $('d-time').textContent = [fmtTime(it.time), ago(it.time)].filter(Boolean).join(' · ');
    $('d-title').textContent = it.title;
    $('d-desc').textContent = it.desc || '';
    const a = $('btn-open');
    if (it.link) { a.href = it.link; a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
    $('core-num').textContent = pad(state.sel + 1);
  }

  function renderTicker() {
    const track = $('ticker');
    track.replaceChildren();
    const titles = state.items.slice(0, 15).map((i) => i.title);
    if (!titles.length) return;
    for (let k = 0; k < 2; k++) titles.forEach((t) => track.appendChild(el('span', null, t)));
    const chars = titles.join('').length;
    track.style.animationDuration = `${Math.max(40, chars * 0.22)}s`;
  }

  function renderSources(sources) {
    const ul = $('sources');
    ul.replaceChildren();
    sources.forEach((s) => {
      const li = el('li', s.ok ? '' : 'err');
      li.append(el('i'), el('span', null, s.name), el('span', null, s.ok ? `${s.count} items` : s.error || 'ERROR'));
      ul.appendChild(li);
    });
  }

  function select(i, announce) {
    if (!state.items.length) return;
    state.sel = (i + state.items.length) % state.items.length;
    highlight();
    renderDetail();
    if (announce) say(`記事 ${pad(state.sel + 1)} を表示中。`);
  }

  // ---------- データ取得 ----------
  async function loadNews(cat = state.cat, { voice = false } = {}) {
    state.cat = cat;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat));
    $('core').classList.add('loading');
    $('core-label').textContent = 'SYNCING';
    say(`${CAT_LABEL[cat]}ニュースを取得しています…`);
    try {
      const res = await fetch(`/api/news?cat=${encodeURIComponent(cat)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.items = data.items || [];
      state.sel = 0;
      renderList();
      renderDetail();
      renderTicker();
      renderSources(data.sources || []);
      $('feed-count').textContent = state.items.length;
      $('g-sync').textContent = new Date(data.fetchedAt).toLocaleTimeString('ja-JP');
      $('g-lat').textContent = data.cached ? 'CACHED' : `${data.latencyMs} ms`;
      setChip('chip-link', data.sources.some((s) => s.ok) ? 'ok' : 'err');
      setChip('chip-mode', data.demo ? 'warn' : 'ok', data.demo ? 'DEMO' : 'LIVE');
      state.demo = data.demo;
      $('core-label').textContent = data.demo ? 'DEMO' : 'ONLINE';
      const msg = data.demo
        ? 'フィードに接続できません。デモデータを表示しています。'
        : `${CAT_LABEL[cat]}ニュース、${state.items.length}件を取得しました。`;
      say(msg);
      if (voice) speak(msg);
    } catch (e) {
      setChip('chip-link', 'err');
      $('core-label').textContent = 'OFFLINE';
      say(`通信エラー: ${e.message}。サーバーが起動しているか確認してください。`);
    } finally {
      $('core').classList.remove('loading');
      state.nextSync = Date.now() + REFRESH_MS;
    }
  }

  async function loadWeather() {
    try {
      const res = await fetch('/api/weather', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const w = await res.json();
      $('w-temp').textContent = w.temp != null ? Math.round(w.temp) : '--';
      $('w-desc').textContent = `${w.city} · ${WMO[w.code] ?? '—'}`;
      $('w-mm').textContent = w.max != null ? `${Math.round(w.max)}° / ${Math.round(w.min)}°` : '--';
      $('w-hum').textContent = w.humidity != null ? `${w.humidity}%` : '--';
      $('w-wind').textContent = w.wind != null ? `${w.wind} km/h` : '--';
      $('w-rain').textContent = w.rain != null ? `${w.rain}%` : '--';
    } catch {
      $('w-desc').textContent = '気象データに接続できません';
    }
  }

  // ---------- 読み上げ ----------
  function readCurrent() {
    const it = state.items[state.sel];
    if (!it) return;
    say(`読み上げ中: ${it.title}`);
    speak(`${it.source}より。${it.title}。${it.desc || ''}`);
  }
  async function briefing() {
    if (!state.items.length) return;
    stopSpeaking();
    const n = Math.min(5, state.items.length);
    say(`${CAT_LABEL[state.cat]}ニュース、上位${n}件のブリーフィングを開始します。`);
    const p = speak(`${CAT_LABEL[state.cat]}ニュース、上位${n}件をお伝えします。`);
    const gen = state.speechGen; // 別の読み上げ・停止が入ったら世代が変わる
    await p;
    for (let i = 0; i < n && synth && state.speechGen === gen; i++) {
      select(i, false);
      say(`[${i + 1}/${n}] ${state.items[i].title}`);
      await speak(state.items[i].title, { queue: true });
    }
  }

  // ---------- 音声コマンド ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function handleCommand(text) {
    const t = text.replace(/\s/g, '');
    say(`認識: 「${text}」`);
    const catHit = [['経済', 'economy'], ['国際', 'world'], ['世界', 'world'], ['テック', 'tech'], ['技術', 'tech'], ['IT', 'tech'],
      ['科学', 'science'], ['主要', 'top'], ['トップ', 'top']].find(([k]) => t.includes(k));
    if (/止め|ストップ|静か/.test(t)) { stopSpeaking(); return say('了解。停止しました。'); }
    if (/ブリーフィング|まとめ|全部/.test(t)) return briefing();
    if (catHit) return loadNews(catHit[1], { voice: true });
    if (/次|つぎ|ネクスト/.test(t)) { select(state.sel + 1); return readCurrent(); }
    if (/前|戻/.test(t)) { select(state.sel - 1); return readCurrent(); }
    if (/読/.test(t)) return readCurrent();
    if (/開/.test(t)) return openCurrent();
    if (/更新|リロード|再取得/.test(t)) return loadNews(state.cat, { voice: true });
    speak('すみません、そのコマンドは認識できませんでした。');
  }
  function toggleMic() {
    if (!rec) return;
    if (state.listening) { rec.stop(); return; }
    stopSpeaking();
    try { rec.start(); } catch { /* 既に開始済み */ }
  }
  if (SR) {
    rec = new SR();
    rec.lang = 'ja-JP';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { state.listening = true; $('btn-mic').classList.add('on'); say('聞いています…'); };
    rec.onend = () => { state.listening = false; $('btn-mic').classList.remove('on'); };
    rec.onerror = (e) => say(`音声認識エラー: ${e.error}`);
    rec.onresult = (e) => handleCommand(e.results[0][0].transcript);
    setChip('chip-voice', synth ? 'ok' : 'warn');
  } else {
    $('btn-mic').disabled = true;
    $('btn-mic').title = 'このブラウザは音声認識に未対応です (Chrome / Edge で利用可)';
    setChip('chip-voice', synth ? 'warn' : 'err');
  }

  function openCurrent() {
    const it = state.items[state.sel];
    if (it?.link) window.open(it.link, '_blank', 'noopener');
  }

  // ---------- 入力 ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b) loadNews(b.dataset.cat);
  });
  $('btn-read').addEventListener('click', readCurrent);
  $('btn-mic').addEventListener('click', toggleMic);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const cats = ['top', 'economy', 'world', 'tech', 'science'];
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); select(state.sel + 1, true); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); select(state.sel - 1, true); }
    else if (e.key === 'Enter') openCurrent();
    else if (e.key === ' ') { e.preventDefault(); synth?.speaking ? stopSpeaking() : readCurrent(); }
    else if (e.key === 'r' || e.key === 'R') loadNews(state.cat);
    else if (e.key === 'a' || e.key === 'A') briefing();
    else if (e.key === 'm' || e.key === 'M') toggleMic();
    else if (e.key === 'Escape') stopSpeaking();
    else if (/^[1-5]$/.test(e.key)) loadNews(cats[Number(e.key) - 1]);
  });

  // ---------- 時計・診断 ----------
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function tick() {
    const d = new Date();
    $('clock-time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('clock-date').textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WD[d.getDay()]})`;
    const up = Math.floor((Date.now() - state.bootAt) / 1000);
    $('g-up').textContent = `${pad(Math.floor(up / 3600))}:${pad(Math.floor(up / 60) % 60)}:${pad(up % 60)}`;
    if (state.nextSync) {
      const left = Math.max(0, Math.round((state.nextSync - Date.now()) / 1000));
      $('g-next').textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      if (left === 0) { state.nextSync = 0; loadNews(state.cat); loadWeather(); }
    }
  }

  // ---------- 起動シーケンス ----------
  async function boot() {
    const lines = [
      '> VEGA CORE v1.0 ............ INIT',
      '> NEURAL INTERFACE .......... OK',
      '> SPEECH SYNTH .............. ' + (synth ? 'OK' : 'N/A'),
      '> VOICE RECOGNITION ......... ' + (SR ? 'OK' : 'N/A'),
      '> NEWS UPLINK ............... CONNECTING',
      '> ALL SYSTEMS NOMINAL.',
    ];
    const log = $('boot-log');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < lines.length; i++) {
      log.textContent += lines[i] + '\n';
      $('boot-progress').style.width = `${((i + 1) / lines.length) * 100}%`;
      if (!reduce) await new Promise((r) => setTimeout(r, 220));
    }
    await new Promise((r) => setTimeout(r, reduce ? 0 : 300));
    $('boot').classList.add('done');
  }

  buildTicks();
  setInterval(tick, 1000);
  tick();
  Promise.all([boot(), loadNews('top'), loadWeather()]).then(() => {
    if (!state.demo && state.items.length) say('おかえりなさい。本日のヘッドラインを準備しました。');
  });
})();
