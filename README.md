# AnimeMaker

キャラクター画像から、ゲーム素材として使いやすいポーズ違い画像 / コマ送りアニメ素材を生成するローカル Web ツール。

**API キー不要。** 画像生成は手元の Codex CLI (`codex app-server`) が担当します (ChatGPT/Codex の認証済みセッションを再利用)。

## 2 つのモード

### ポーズ作成モード
基準キャラクター画像 + ポーズ指示 → 同一キャラクターのポーズ違い画像を 1 枚生成。

### アニメーション作成モード
基準画像を中心フレームとして、前後 3 フレームずつ・合計 7 枚の連番 PNG を生成。順番につなげると自然なコマ送りアニメーションとして成立するよう、各フレームに個別の役割を持たせます。

## ワンコマンド起動 (友達向け)

### macOS
ターミナルで以下を貼って Enter:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Getabako/AnimeMaker/main/install.sh)"
```

### Windows
PowerShell で以下を貼って Enter:
```powershell
iwr -useb https://raw.githubusercontent.com/Getabako/AnimeMaker/main/install.ps1 | iex
```

初回は Homebrew / Node.js / Codex CLI / 本体を自動インストールし、ChatGPT へのログインを促します。
2 回目以降は同じコマンドで自動的に最新版に更新して起動します。

`.env` ファイルは**作らない**こと。`OPENAI_API_KEY` 等の API キーは一切使用しません。
画像生成は `codex` CLI 経由で ChatGPT 認証セッションが担当します。

## 開発者向けセットアップ

```bash
git clone https://github.com/Getabako/AnimeMaker.git
cd AnimeMaker
npm install
npm run dev        # http://localhost:3000
# 本番起動: npm run build && npm start
```

## 出力先

UI 上部の「ホゾンサキ フォルダ」欄で **保存先を自由に指定** できます (絶対パス)。
既定値は `~/Desktop/AnimeMaker`。
「フォルダ センタク」ボタン (Chromium のみ) でフォルダ選択ダイアログも開けます。
指定したフォルダの中に、ジョブごとのサブフォルダが自動作成されます。

```
<指定フォルダ>/pose-20260514-1830-ab12/
  reference.png      # アップロードした基準画像
  prompt.txt         # Codex に渡した指示プロンプト
  pose.png           # 生成画像
  manifest.json      # Codex が書き出す結果メタ
```

```
<指定フォルダ>/anim-20260514-1830-cd34/
  reference.png
  prompt.txt
  frame_-3.png ... frame_+3.png
  manifest.json
  anim-20260514-1830-cd34.zip
```

## 使い方の推奨フロー

1. **ポーズ作成モード**で目的のポーズ画像を 1 枚作る。
2. その出力画像を**アニメーション作成モード**に入れ直して前後フレームを生成する。

中心フレーム付近の見た目が整っているほど、前後フレームのキャラクター一貫性が安定します。

## API

すべて `multipart/form-data`。レスポンスは Server-Sent Events で進捗をストリームし、最後の `done` イベントに成果物 URL が入ります。

- `POST /api/pose` — `image`, `posePrompt`, `backgroundColor?`, `size?`
- `POST /api/animation` — `image`, `motionPrompt`, `framesBefore?`, `framesAfter?`, `motionStrength?`, `backgroundColor?`, `size?`
- `GET /api/jobs/:id/:file` — ジョブ成果物 (PNG / ZIP / manifest.json) の配信

## アーキテクチャ

Next.js 16 App Router + `codex app-server` を JSON-RPC で常駐起動。
ジョブごとに専用 cwd を作り、参照画像とプロンプトを置いて Codex に `turn/start` を投げます。Codex は cwd の `reference.png` を見ながら画像を生成して書き戻し、API ルートが `done` イベントで結果 URL を返します。

外部 LLM/Image API を呼ばないルールは `AGENTS.md` と Codex に渡すプロンプトの両方で固定しています。
