#!/usr/bin/env bash
# AnimeMaker — one-line installer & launcher (macOS)
#
# 1 行コマンド:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Getabako/AnimeMaker/main/install.sh)"
#
# 何度貼っても OK。初回は全部インストール、2 回目以降は最新版に更新して起動。

set -e

# --- 設定 ---------------------------------------------------------------
GH_REPO="${ANIMEMAKER_REPO:-Getabako/AnimeMaker}"
BRANCH="${ANIMEMAKER_BRANCH:-main}"
# インストール先：デスクトップにわかりやすく置く。中身を開いて AI（codex / Claude）に
# 直してもらえるよう、隠しフォルダではなくデスクトップの "AnimeMaker" フォルダにする。
INSTALL_DIR="${ANIMEMAKER_HOME:-$HOME/Desktop/AnimeMaker}"
# -----------------------------------------------------------------------

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

cyan "▶ AnimeMaker セットアップを開始します"

# 1. OS チェック
if [[ "$(uname)" != "Darwin" ]]; then
  red "✗ install.sh は macOS 向けです。"
  red ""
  red "Windows の方は PowerShell で以下の 1 行を実行してください:"
  red "  iwr -useb https://raw.githubusercontent.com/$GH_REPO/main/install.ps1 | iex"
  exit 1
fi

# 道具の確認（Homebrew/Node/git/Codex は「第一の儀（環境構築）」で支度済みの前提）
[[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
[[ -x /usr/local/bin/brew ]] && eval "$(/usr/local/bin/brew shellenv)"
__missing=""
command -v node  >/dev/null 2>&1 || __missing="$__missing Node.js"
command -v git   >/dev/null 2>&1 || __missing="$__missing git"
command -v codex >/dev/null 2>&1 || __missing="$__missing Codex"
if [[ -n "$__missing" ]]; then
  red "✗ 道具が足りません：$__missing"
  red ""
  red "先に『第一の儀（環境構築）』を一度だけ実行してください:"
  red "  /bin/bash -c \"\$(curl -fsSL https://service.if-juku.net/Ashura/setup.sh)\""
  red ""
  red "（整え終えたら、もう一度この 1 行を貼り直してください）"
  exit 1
fi

# 6. リポジトリを取得 or 更新
# 旧フォルダ ~/.animemaker からの移行（新しい場所が未作成なら引っ越し）
OLD_DIR="$HOME/.animemaker"
if [[ -z "${ANIMEMAKER_HOME:-}" && -d "$OLD_DIR/.git" && ! -d "$INSTALL_DIR/.git" ]]; then
  cyan "▶ 旧フォルダ ~/.animemaker をデスクトップへ移動します"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$OLD_DIR" "$INSTALL_DIR"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  # ローカルで修正している人（AI に直してもらった等）の変更を消さないように、
  # 未コミットの修正がある場合は自動更新（reset --hard）をスキップして保持する。
  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain 2>/dev/null)" ]]; then
    cyan "▶ あなたの修正を保持したまま起動します（自動更新はスキップ）"
    cyan "  最新版に戻したい時は: cd \"$INSTALL_DIR\" && git reset --hard origin/$BRANCH"
  else
    cyan "▶ 既存のアプリを最新版に更新します"
    git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
    git -C "$INSTALL_DIR" reset --quiet --hard "origin/$BRANCH"
  fi
else
  cyan "▶ アプリをダウンロードします → $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  git clone --quiet --depth 1 --branch "$BRANCH" \
    "https://github.com/$GH_REPO.git" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 7. 依存と本番ビルド（コミットが変わった or 成果物が無いなら再ビルド）
CUR_SHA="$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
MARK_FILE="$INSTALL_DIR/.next/.built-sha"
LAST_SHA=""
[[ -f "$MARK_FILE" ]] && LAST_SHA="$(cat "$MARK_FILE" 2>/dev/null || echo)"

NEED_BUILD=0
[[ ! -d node_modules ]] && NEED_BUILD=1
[[ ! -f .next/standalone/server.js ]] && NEED_BUILD=1
[[ "$CUR_SHA" != "$LAST_SHA" ]] && NEED_BUILD=1
# ローカルで直したソースがビルドより新しければ、その修正を反映するため再ビルド
if [[ -f "$MARK_FILE" ]] && [[ -n "$(find app lib bin public next.config.ts package.json -newer "$MARK_FILE" 2>/dev/null || true)" ]]; then
  NEED_BUILD=1
fi

if [[ "$NEED_BUILD" -eq 1 ]]; then
  cyan "▶ アプリを準備中（初回 or 更新があった時のみ・30 秒〜1 分）"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --silent
    pnpm build >/dev/null
  else
    npm install --silent
    npm run build >/dev/null
  fi
  mkdir -p "$INSTALL_DIR/.next"
  echo "$CUR_SHA" > "$MARK_FILE"
fi

# 8. ChatGPT へのログイン
if ! codex login status >/dev/null 2>&1; then
  cyan ""
  cyan "▶ 初回ログイン: ChatGPT アカウントと接続します"
  cyan "  ブラウザが開きます。ChatGPT (Plus/Pro/Business) でサインインしてください。"
  cyan ""
  codex login || {
    red "ログインがキャンセルされました。次回もう一度この 1 行を実行してください。"
    exit 1
  }
fi

# 9. 起動
green ""
green "✓ 起動します。ブラウザが自動で開きます。終了は Ctrl+C。"
green ""
exec node bin/cli.js
