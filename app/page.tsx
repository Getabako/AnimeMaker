"use client";

import { useRef, useState } from "react";

type Mode = "pose" | "animation";
type Log = { kind: string; text: string; ts: number };
type PoseResult = { id: string; mode: "pose"; imageUrl: string };
type AnimResult = {
  id: string;
  mode: "animation";
  frames: Array<{ index: number; file: string; ok: boolean }>;
  zipUrl: string;
};
type Result = PoseResult | AnimResult;

export default function Home() {
  const [mode, setMode] = useState<Mode>("pose");
  const [image, setImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [bg, setBg] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [framesBefore, setFramesBefore] = useState(3);
  const [framesAfter, setFramesAfter] = useState(3);
  const [motionStrength, setMotionStrength] = useState<"subtle" | "small" | "medium">("small");

  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const append = (kind: string, text: string) =>
    setLogs((p) => {
      const next = [...p, { kind, text, ts: Date.now() }];
      queueMicrotask(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      return next;
    });

  const start = async () => {
    if (!image) return append("error", "画像を選択してください");
    if (!prompt.trim()) return append("error", "指示テキストを入力してください");

    setBusy(true);
    setLogs([]);
    setResult(null);

    const fd = new FormData();
    fd.append("image", image);
    if (bg.trim()) fd.append("backgroundColor", bg.trim());
    fd.append("size", size);
    if (mode === "pose") {
      fd.append("posePrompt", prompt);
    } else {
      fd.append("motionPrompt", prompt);
      fd.append("framesBefore", String(framesBefore));
      fd.append("framesAfter", String(framesAfter));
      fd.append("motionStrength", motionStrength);
    }

    append("info", `▶ Codex に ${mode === "pose" ? "ポーズ" : "アニメ"} 生成を依頼…`);
    const res = await fetch(`/api/${mode}`, { method: "POST", body: fd });
    if (!res.body) {
      append("error", "通信失敗");
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const eventLine = raw.split("\n").find((l) => l.startsWith("event:"));
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!eventLine || !dataLine) continue;
        const ev = eventLine.slice(6).trim();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(dataLine.slice(5).trim()); } catch {}
        handleEvent(ev, data);
      }
    }
    setBusy(false);
  };

  const handleEvent = (ev: string, data: Record<string, unknown>) => {
    switch (ev) {
      case "init":
        append("info", `job: ${String(data.id)}`);
        return;
      case "step":
        append(String(data.kind ?? "info"), String(data.text ?? ""));
        return;
      case "delta":
      case "reasoning_delta":
      case "cmd_output":
        return; // ノイズが多いので非表示
      case "agent":
        append("agent", String(data.text ?? ""));
        return;
      case "stderr":
        append("stderr", String(data.text ?? ""));
        return;
      case "heartbeat":
        return;
      case "error":
        append("error", String(data.message ?? "error"));
        return;
      case "done":
        append("done", "🎉 完成");
        setResult(data as unknown as Result);
        return;
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-6 grid gap-6">
      <header>
        <h1 className="text-2xl font-bold">AnimeMaker</h1>
        <p className="text-sm opacity-70">
          キャラクター画像からゲーム素材を生成 (Codex App Server バックエンド・API キー不要)
        </p>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-5 grid gap-3">
        <label className="text-sm font-semibold">モード</label>
        <select
          className="border rounded px-2 py-1"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
        >
          <option value="pose">ポーズ作成モード</option>
          <option value="animation">アニメーション作成モード (前後3フレーム計7枚)</option>
        </select>

        <label className="text-sm font-semibold mt-2">基準キャラクター画像</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />

        <label className="text-sm font-semibold mt-2">指示テキスト</label>
        <textarea
          rows={3}
          className="border rounded px-2 py-1"
          placeholder={
            mode === "pose"
              ? "例: 攻撃前の構えにして / 振り向きざまのポーズ"
              : "例: 剣を振り下ろす一連の動作 / 襲いかかる直前の動き"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="text-sm font-semibold">背景色 (例 #FF00FF)</label>
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="未指定なら自動"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold">出力サイズ</label>
            <select
              className="border rounded px-2 py-1 w-full"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            >
              <option>1024x1024</option>
              <option>1024x1536</option>
              <option>1536x1024</option>
            </select>
          </div>
        </div>

        {mode === "animation" && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div>
              <label className="text-sm font-semibold">前フレーム数</label>
              <input
                type="number"
                min={0}
                max={6}
                className="border rounded px-2 py-1 w-full"
                value={framesBefore}
                onChange={(e) => setFramesBefore(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">後フレーム数</label>
              <input
                type="number"
                min={0}
                max={6}
                className="border rounded px-2 py-1 w-full"
                value={framesAfter}
                onChange={(e) => setFramesAfter(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold">動きの強さ</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={motionStrength}
                onChange={(e) => setMotionStrength(e.target.value as "subtle" | "small" | "medium")}
              >
                <option value="subtle">subtle</option>
                <option value="small">small</option>
                <option value="medium">medium</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={start}
          disabled={busy}
          className="mt-3 px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
        >
          {busy ? "生成中..." : "生成する"}
        </button>
      </section>

      {(logs.length > 0 || busy) && (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h2 className="text-sm font-semibold mb-2">進捗ログ</h2>
          <div className="text-xs font-mono max-h-64 overflow-auto space-y-0.5">
            {logs.map((l, i) => (
              <div key={i} className={kindClass(l.kind)}>
                <span className="opacity-50 mr-2">[{l.kind}]</span>
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
      )}

      {result && (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-5">
          <h2 className="text-sm font-semibold mb-3">生成結果</h2>
          {result.mode === "pose" ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageUrl} alt="pose" className="max-w-full border" />
              <a href={result.imageUrl} download className="inline-block mt-2 text-blue-600 underline text-sm">
                PNG ダウンロード
              </a>
            </div>
          ) : (
            <div>
              <a href={result.zipUrl} download className="inline-block mb-3 text-blue-600 underline text-sm">
                ZIP ダウンロード (連番 + manifest.json)
              </a>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {result.frames
                  .slice()
                  .sort((a, b) => a.index - b.index)
                  .map((f) => (
                    <div
                      key={f.index}
                      className={`border p-2 text-center text-xs ${f.ok ? "" : "bg-red-50"}`}
                    >
                      <div className="mb-1">frame {f.index}</div>
                      {f.ok ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.file} alt={`frame ${f.index}`} className="w-full border" />
                          <a href={f.file} download className="text-blue-600 underline">
                            DL
                          </a>
                        </>
                      ) : (
                        <div className="text-red-600">失敗</div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function kindClass(kind: string): string {
  if (kind === "error" || kind === "command-err") return "text-red-600";
  if (kind === "done" || kind === "command-ok" || kind === "file-ok") return "text-green-700";
  if (kind === "agent") return "text-blue-700";
  return "";
}
