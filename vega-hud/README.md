# VEGA — Virtual Executive for Global Awareness

SF映画のAIアシスタント風HUDでニュースを見るアプリ。依存パッケージゼロ、Node.js 18+ だけで動く。
PC・スマホ両対応。ホーム画面に追加すればアプリとして全画面で起動できる（PWA）。

名前の由来: こと座α星ベガ（織姫星）。かつて星の明るさの基準星だった。

## 使い方は2通り

### A. PCでサーバーを動かす（同じWi-Fiのスマホからも見られる）

```bash
cd vega-hud
node server.js
#   PC      → http://localhost:3000
#   スマホ  → http://192.168.x.x:3000   ← 起動時に表示されるアドレスをスマホで開く
```

- 天気の地点: `LAT=34.70 LON=135.50 CITY=OSAKA node server.js`
- 見た目だけ確認: `DEMO=1 node server.js`
- 制約: スマホから `http://` で開いた場合、**音声コマンドは使えない**（ブラウザがマイクをHTTPSでしか許可しないため）。読み上げは使える。
- スマホからつながらない場合は、PCのファイアウォールでポート3000への受信を許可する。

### B. GitHub Pages で公開する（PC不要・どこからでも見られる）

`.github/workflows/vega-pages.yml` がGitHub上で1時間ごとにニュースを取得し、静的サイトとして公開する。

1. このブランチを `main` にマージする（定期実行は `main` でしか動かない）
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
3. **Actions** タブ → *VEGA news → GitHub Pages* → **Run workflow** で初回実行
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` をスマホで開き、「ホーム画面に追加」

注意:
- 無料プランでは **公開リポジトリでしか Pages を使えない**（非公開のまま使うには GitHub Pro 以上が必要）
- Pages のURLを知っている人は誰でも見られる
- 公開リポジトリでは、60日間コミットがないと定期実行が自動停止する（Actions タブから再開できる）

## 操作

| 機能 | キーボード | スマホ |
| --- | --- | --- |
| カテゴリ切替 | `1`〜`5` | タブをタップ |
| 見出し選択 | `↑` `↓` | タップ / 詳細カードを左右スワイプ |
| 記事を開く | `Enter` | 「記事を開く」 |
| 読み上げ / 停止 | `Space` / `Esc` | 「読み上げ」 |
| 上位5件ブリーフィング | `A` | 音声「ブリーフィング」 |
| 音声コマンド（Chrome / Edge、HTTPSのみ） | `M` | 「音声コマンド」 |
| 再取得 | `R` | 5分ごと自動 |

音声コマンド: 「経済」「国際」「テック」「科学」「主要」「次」「前」「読んで」「開いて」「更新」「ブリーフィング」「止めて」

## 構成

```
server.js              RSS取得・パース・キャッシュ、天気API中継、静的配信（A用）
build.js               全カテゴリを public/data/*.json に書き出す（B用）
public/index.html
public/style.css
public/app.js          API(サーバー) → data/*.json(静的) の順に自動で取得先を切替
public/sw.js           オフライン時は最後に取得したデータを表示
public/manifest.webmanifest, icons/   PWA用
```

## データソース

`server.js` の `FEEDS` で変更可能。

- NHKニュース RSS
- Google ニュース RSS（日本版のトピック別）
- ITmedia RSS
- 天気: [Open-Meteo](https://open-meteo.com/)（APIキー不要）

各フィードの利用規約は提供元に従うこと。
