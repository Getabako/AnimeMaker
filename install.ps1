# AnimeMaker — Windows one-line installer & launcher
#
# 1 行 (PowerShell):
#   iwr -useb https://raw.githubusercontent.com/Getabako/AnimeMaker/main/install.ps1 | iex
#
# 何度貼っても OK。初回は全部インストール、2 回目以降は最新版に更新して起動。

$ErrorActionPreference = "Stop"

trap {
    Write-Host "" -ForegroundColor Red
    Write-Host "──────────────────────────────────────────" -ForegroundColor Red
    Write-Host "  途中で止まりました。上の赤い文字（エラー）をコピーして" -ForegroundColor Red
    Write-Host "  Codex か Claude Code に貼り付け『このエラーを直して』と頼んでください。" -ForegroundColor Red
    Write-Host "──────────────────────────────────────────" -ForegroundColor Red
    break
}

$GH_REPO    = if ($env:ANIMEMAKER_REPO)   { $env:ANIMEMAKER_REPO }   else { "Getabako/AnimeMaker" }
$BRANCH     = if ($env:ANIMEMAKER_BRANCH) { $env:ANIMEMAKER_BRANCH } else { "main" }
# インストール先：デスクトップにわかりやすく置く（隠しフォルダにしない）。
# OneDrive でデスクトップがリダイレクトされている場合も考慮して GetFolderPath を使う。
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$InstallDir = if ($env:ANIMEMAKER_HOME)  { $env:ANIMEMAKER_HOME }  else { Join-Path $DesktopDir "AnimeMaker" }

function Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function OK($msg)   { Write-Host $msg -ForegroundColor Green }
function Err($msg)  { Write-Host $msg -ForegroundColor Red }

Info "▶ AnimeMaker セットアップを開始します（Windows）"

# 道具の確認（Node/git/Codex は「第一の儀（環境構築）」で支度済みの前提）
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$__missing = @()
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $__missing += "Node.js"
} else {
    $__nodeMajor = 0; try { $__nodeMajor = [int](node -p "process.versions.node.split('.')[0]") } catch {}
    if ($__nodeMajor -lt 20) { $__missing += "Node.js(20以上に更新を)" }
}
if (-not (Get-Command git   -ErrorAction SilentlyContinue)) { $__missing += "git" }
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) { $__missing += "Codex" }
if ($__missing.Count -gt 0) {
    Write-Host ("✗ 道具が足りません：" + ($__missing -join ", ")) -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "先に『第一の儀（環境構築）』を一度だけ実行してください:" -ForegroundColor Red
    Write-Host "  iwr -useb https://service.if-juku.net/Ashura/setup.ps1 | iex" -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "（整え終えたら、もう一度この 1 行を貼り直してください）" -ForegroundColor Red
    exit 1
}

# 旧フォルダ ~\.animemaker からの移行（新しい場所が未作成なら引っ越し）
$OldDir = Join-Path $HOME ".animemaker"
if ((-not $env:ANIMEMAKER_HOME) -and (Test-Path "$OldDir\.git") -and (-not (Test-Path "$InstallDir\.git"))) {
    Info "▶ 旧フォルダ ~\.animemaker をデスクトップへ移動します"
    Move-Item -Force $OldDir $InstallDir
}

if (Test-Path "$InstallDir\.git") {
    # ローカルで修正している人の変更を消さないよう、未コミット修正があれば
    # 自動更新（reset --hard）をスキップして保持する。
    $dirty = git -C $InstallDir status --porcelain
    if ($dirty) {
        Info "▶ あなたの修正を保持したまま起動します（自動更新はスキップ）"
        Info "  最新版に戻したい時は: cd `"$InstallDir`"; git reset --hard origin/$BRANCH"
    } else {
        Info "▶ 既存のアプリを最新版に更新します"
        git -C $InstallDir fetch --quiet origin $BRANCH
        git -C $InstallDir reset --quiet --hard "origin/$BRANCH"
    }
} else {
    Info "▶ アプリをダウンロードします → $InstallDir"
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    git clone --quiet --depth 1 --branch $BRANCH "https://github.com/$GH_REPO.git" $InstallDir
}

Set-Location $InstallDir

$CurSha = (git -C $InstallDir rev-parse HEAD).Trim()
$MarkFile = "$InstallDir\.next\.built-sha"
$LastSha = if (Test-Path $MarkFile) { (Get-Content $MarkFile -ErrorAction SilentlyContinue).Trim() } else { "" }

$NeedBuild = $false
if (-not (Test-Path "$InstallDir\node_modules")) { $NeedBuild = $true }
if (-not (Test-Path "$InstallDir\.next\standalone\server.js")) { $NeedBuild = $true }
if ($CurSha -ne $LastSha) { $NeedBuild = $true }
# ローカルで直したソースがビルドより新しければ、その修正を反映するため再ビルド
if (Test-Path $MarkFile) {
    $buildTime = (Get-Item $MarkFile).LastWriteTime
    $srcDirs = @("app","lib","bin","public","next.config.ts","package.json") | Where-Object { Test-Path (Join-Path $InstallDir $_) }
    $newer = Get-ChildItem -Path $srcDirs -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt $buildTime } | Select-Object -First 1
    if ($newer) { $NeedBuild = $true }
}

if ($NeedBuild) {
    Info "▶ アプリを準備中（初回 or 更新時のみ）"
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
        pnpm build
    } else {
        npm install
        npm run build
    }
    New-Item -ItemType Directory -Force -Path "$InstallDir\.next" | Out-Null
    Set-Content -Path $MarkFile -Value $CurSha
}

try { codex login status *>$null } catch {
    Info ""
    Info "▶ 初回ログイン: ChatGPT アカウントと接続します"
    Info "  ブラウザが開きます。サインインしてください。"
    Info ""
    codex login
}

OK ""
OK "✓ 起動します。終了は Ctrl+C。"
OK ""
# スラッシュコマンドを設置（/animemaker で起動できるように）
try { & ([scriptblock]::Create((iwr -useb https://service.if-juku.net/Ashura/install-command.ps1).Content)) animemaker "Anime Maker" "$InstallDir" "node bin\cli.js" } catch {}
node "$InstallDir\bin\cli.js"
