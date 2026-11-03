# VEGA — News HUD

SF映画のAIアシスタント風HUDでニュースを見るアプリ。依存パッケージゼロ、Node.js 18+ だけで動く。

## 起動

```bash
cd vega-hud
node server.js          # → http://localhost:3000
```

- 位置を変える（天気用）: `LAT=34.70 LON=135.50 CITY=OSAKA node server.js`
- ネット接続なしで見た目だけ確認: `DEMO=1 node server.js`
- ポート変更: `PORT=8080 node server.js`

## 機能

| 機能 | 操作 |
| --- | --- |
| カテゴリ切替（主要/経済/国際/テック/科学） | `1`〜`5` / タブをクリック |
| 見出し選択 | `↑` `↓`（`j` `k`） |
| 記事を開く | `Enter` |
| 読み上げ（Web Speech API） | `Space`（読み上げ中に押すと停止） |
| 上位5件ブリーフィング | `A` |
| 音声コマンド（Chrome / Edge） | `M` →「経済」「次」「読んで」「開いて」「更新」「ブリーフィング」「止めて」 |
| 再取得 | `R`（自動更新は5分ごと） |

## 構成

```
server.js        RSS取得・パース・5分キャッシュ、天気API中継、静的ファイル配信
public/index.html
public/style.css HUDの見た目（リング、スキャンライン、ティッカー）
public/app.js    描画・音声合成・音声認識・キーボード操作
```

ブラウザから直接RSSを取ると CORS で弾かれるため、`server.js` が中継している。

## データソース

`server.js` の `FEEDS` で変更可能。

- NHKニュース RSS（`www3.nhk.or.jp/rss/news/cat*.xml`）
- Google ニュース RSS（日本版のトピック別フィード）
- ITmedia RSS
- 天気: [Open-Meteo](https://open-meteo.com/)（APIキー不要）

各フィードの利用規約は提供元に従うこと。個人で使う前提の構成になっている。
