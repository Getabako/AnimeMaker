// Codex に渡す指示プロンプト。画像生成は Codex が自身のツールで実行する。
// 外部 API キー (OPENAI_API_KEY 等) は使用禁止。

const COMMON_RULES = `# 🚨 ツール使用ルール（絶対）

- 外部 API キー (OPENAI_API_KEY, GEMINI_API_KEY 等) は **使用禁止**。.env も作らない。
- 画像生成は **あなた (Codex) 自身が持っている画像生成ツール** で行う。
  外部の HTTP / curl で画像生成 API を叩かない。
- 参照画像は cwd 内に \`reference.png\` として既に置かれている。これを必ず参照する。
- 出力ファイルは cwd 直下に書く。サブディレクトリを切らない。
- 生成が終わったら **必ず** \`manifest.json\` を書き出して終了。`;

const CHARACTER_CONSISTENCY = `# キャラクター一貫性（最重要）

各画像で **絶対に守ること**:
- 参照画像のキャラクター ID・シルエット・体型・顔・目・配色・衣装・装飾・線画スタイル・全体デザインを厳密に維持
- キャラクターをリデザインしない
- 別キャラを描かない / 追加キャラを描かない
- 腕の本数を変えない / 装飾を変えない / 配色を変えない
- 顔・目の形・色を変えない`;

const SCENE_RULES = `# 画面ルール

- キャラクター 1 体のみ。全身が画面内に収まる。
- 背景は **完全な単色** (フラット塗りつぶし)。グラデ・模様・テクスチャ禁止。
- 影・地面・エフェクト・煙・魔法陣・武器追加・小物追加・テキスト・ロゴ・風景は一切描かない。
- 背景色は **キャラクターに含まれない色** を選ぶ。原則 \`#FF00FF\` (マゼンタ) を使う。
  ただしキャラがピンク系の場合は \`#00FF00\` か \`#00FFFF\` を選ぶ。
- ゲームスプライト用途。輪郭が背景と分離して切り抜きやすい状態に保つ。`;

export type PoseParams = {
  posePrompt: string;
  backgroundColor?: string;
  size?: string; // "1024x1024" | "1024x1536" | "1536x1024"
};

export function buildPoseCodexPrompt(p: PoseParams): string {
  const bg = p.backgroundColor || "auto (キャラに含まれない色を選ぶ。原則 #FF00FF)";
  const size = p.size || "1024x1024";
  return `# あなたへの作業指示 — ポーズ作成モード

cwd の \`reference.png\` を厳密な参照キャラクター画像として扱い、
**同一キャラクターのポーズ違い画像 1 枚** を生成してください。

${COMMON_RULES}

${CHARACTER_CONSISTENCY}

${SCENE_RULES}

# ポーズ指示
ユーザー入力: 「${p.posePrompt}」

ポーズ**だけ**を変える。デザインは一切変えない。

# 出力
- ファイル名: \`pose.png\`
- サイズ: ${size}
- 背景色: ${bg} (完全な単色フラット塗り)

# 完了処理
生成後、cwd 直下に \`manifest.json\` を書き出してください。形式:
\`\`\`json
{
  "mode": "pose",
  "image": "pose.png",
  "backgroundColor": "実際に使った #RRGGBB",
  "size": "${size}",
  "userPrompt": "${escape(p.posePrompt)}"
}
\`\`\`
`;
}

export type AnimationParams = {
  motionPrompt: string;
  framesBefore: number; // 既定 3
  framesAfter: number;  // 既定 3
  motionStrength: "weak" | "medium" | "strong";
  backgroundColor?: string;
  size?: string;
};

export function buildAnimationCodexPrompt(p: AnimationParams): string {
  const bg = p.backgroundColor || "auto (キャラに含まれない色。原則 #FF00FF)";
  const size = p.size || "1024x1024";

  const frames: string[] = [];
  for (let i = -p.framesBefore; i <= p.framesAfter; i++) {
    frames.push(`- ${frameFileName(i)} : ${frameRole(i)}`);
  }

  return `# あなたへの作業指示 — アニメーション作成モード

cwd の \`reference.png\` を厳密な参照キャラクター画像として扱い、
**前後 ${p.framesBefore} フレームずつ、合計 ${p.framesBefore + p.framesAfter + 1} 枚** の
コマ送りアニメ用キャラクター画像を生成してください。
順番につなげると自然な連続動作に見えるようにします。

${COMMON_RULES}

${CHARACTER_CONSISTENCY}

${SCENE_RULES}

# 動作指示
ユーザー入力: 「${p.motionPrompt}」
動きの強さ: **${p.motionStrength}** (${strengthGuide(p.motionStrength)})

# フレーム別の役割
中心フレーム \`frame_000.png\` を参照画像に最も近い基準姿勢とし、
前後フレームは以下の役割でそれぞれ生成すること:

${frames.join("\n")}

# 🚨 サイズ・スケール・カメラ固定（最重要・絶対）

過去の失敗例：あるフレームだけキャラが拡大されたり縮んだりして、サイズが揃わない。
これは絶対に防ぐこと。

- 全フレームで **キャラクターの画面占有率を完全に同一** に保つ。
- 頭の上端の Y 座標、足元（裾の最下端）の Y 座標、体の中心の X 座標を **全フレームで揃える**。
- カメラのズーム・パン・回転は禁止。常に正面・同一画角・同一距離。
- キャンバスの解像度は全フレーム ${size} で固定。アスペクト比も固定。
- 体格・身長・横幅は変えない。アップやロングにしない。

# 🚨 連続動作の必須要件（最重要・絶対）

過去の失敗例：隣接フレームがほぼ同じで止まって見える、または飛んでいて繋がらない。
これは絶対に防ぐこと。

- 各フレームは **直前フレームの中間補間として物理的に成立する** 動きでなければならない。
  つまり frame_-3 → -2 → -1 → 000 → +1 → +2 → +3 を順番に再生すれば、1 つの滑らかなアクションになること。
- **隣接フレーム間に必ず視認できる差分を入れる**（コピーまがいの「ほぼ同じ画像」は NG）。
  特に frame_-2 と frame_-1、frame_+1 と frame_+2、frame_+2 と frame_+3 を取り違えるレベルで似せないこと。
- 同時に **隣接フレームから離れすぎてもいけない**（コマ抜けに見えると NG）。
- **体全体が連動して動く**：肩・腰・胴体・首・頭・腕・指・髪・装飾・裾・足元すべてに段階的な追従動作を入れる。
  腕だけ・髪だけが極端に動くのは禁止。
- 動作の前半（-3 → 000）と後半（000 → +3）で動きの向きと加速度が一貫していること。

# 出力
- ファイル名は上記のとおり連番で cwd 直下に書く。
- 全フレーム同一サイズ: ${size}（厳密に同一）
- 全フレーム同一の単色背景: ${bg}（厳密に同一色）

# 🔁 完了前のセルフチェック（必ず実行）

全フレームを書き出したあと、**自分で生成画像を順番に並べて見比べ**、以下を確認すること:

1. キャラクターのサイズ・位置・画面占有率がすべてのフレームで揃っているか？
2. 隣接フレーム同士が「ほぼ同じ画像」になっていないか？
3. -3 → +3 を順に並べたとき、一連の動作として滑らかに繋がるか？
4. 一部の部位だけが極端に動いて他が止まっていないか？

問題があるフレームは **必ず生成し直してから** \`manifest.json\` を書いて終了すること。
妥協して提出しないこと。

# 完了処理
全フレーム生成後、cwd 直下に \`manifest.json\` を書き出してください。形式:
\`\`\`json
{
  "mode": "animation",
  "frames": [
    { "index": -3, "file": "frame_-3.png" },
    { "index": -2, "file": "frame_-2.png" },
    { "index": -1, "file": "frame_-1.png" },
    { "index": 0,  "file": "frame_000.png" },
    { "index": 1,  "file": "frame_+1.png" },
    { "index": 2,  "file": "frame_+2.png" },
    { "index": 3,  "file": "frame_+3.png" }
  ],
  "backgroundColor": "実際に使った #RRGGBB",
  "size": "${size}",
  "motionStrength": "${p.motionStrength}",
  "userPrompt": "${escape(p.motionPrompt)}"
}
\`\`\`
(framesBefore=${p.framesBefore}, framesAfter=${p.framesAfter} の実数に合わせて配列を作る)
`;
}

export function frameFileName(i: number): string {
  if (i === 0) return "frame_000.png";
  if (i < 0) return `frame_${i}.png`;
  return `frame_+${i}.png`;
}

function frameRole(i: number): string {
  if (i === 0) return "基準姿勢。参照画像に最も近い状態。微調整のみ。サイズ・位置は参照と完全一致。";
  if (i < 0) {
    const n = -i;
    return `動作開始 ${n} ステップ前の準備姿勢。動作方向と逆向きに体全体がやや引き戻った状態。frame_${i + 1 === 0 ? "000" : i + 1 < 0 ? i + 1 : "+" + (i + 1)} と比べて、引き戻り度合が ${n} 段階分はっきり強い。サイズ・足元位置は基準と一致。`;
  }
  return `動作完了 ${i} ステップ後のフォロースルー。基準姿勢から動作方向へさらに進んだ状態。frame_${i - 1 === 0 ? "000" : i - 1 < 0 ? i - 1 : "+" + (i - 1)} と比べて、振り抜き度合が ${i} 段階分はっきり強い。サイズ・足元位置は基準と一致。`;
}

function strengthGuide(s: "weak" | "medium" | "strong"): string {
  if (s === "weak") return "フレーム間は very subtle に。ただし完全に止まっては NG。";
  if (s === "strong") return "フレーム間にはっきり視認できる動きを付ける。ただしキャラ破綻は禁止。";
  return "フレーム間の差分は控えめに。ただし「ほぼ動いてない」は NG。";
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
