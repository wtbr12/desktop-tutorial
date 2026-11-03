// 静的サイト用ビルド: 全カテゴリのニュースと天気を public/data/*.json に書き出す。
// GitHub Actions から定期実行して GitHub Pages に載せる想定。
const fs = require('fs');
const path = require('path');
const { FEEDS, getNews, getWeather } = require('./server');

const OUT = path.join(__dirname, 'public', 'data');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let live = 0;
  for (const cat of Object.keys(FEEDS)) {
    const { cached, ...data } = await getNews(cat);
    for (const s of data.sources) {
      console.log(`[${cat}] ${s.name.padEnd(12)} ${s.ok ? `OK  ${s.count} items` : `ERR ${s.error}`}`);
    }
    if (!data.demo) live++;
    fs.writeFileSync(path.join(OUT, `${cat}.json`), JSON.stringify(data));
  }
  try {
    const w = await getWeather();
    fs.writeFileSync(path.join(OUT, 'weather.json'), JSON.stringify(w));
    console.log(`[weather] OK ${w.temp}°C code=${w.code}`);
  } catch (e) {
    console.log(`[weather] ERR ${e.message}`);
  }
  console.log(`live categories: ${live}/${Object.keys(FEEDS).length}`);
  if (live === 0) {
    console.error('全フィードの取得に失敗しました');
    process.exit(1);
  }
})();
