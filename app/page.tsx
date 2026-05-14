"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "pose" | "animation";
type Log = { kind: string; text: string; ts: number };
type PoseResult = { id: string; mode: "pose"; savedTo: string; imageUrl: string };
type AnimResult = {
  id: string;
  mode: "animation";
  savedTo: string;
  frames: Array<{ index: number; file: string; ok: boolean }>;
  zipUrl: string;
};
type Result = PoseResult | AnimResult;

const LS_SAVE_ROOT = "animemaker.saveRoot";

export default function Home() {
  const [mode, setMode] = useState<Mode>("pose");
  const [image, setImage] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [bg, setBg] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [framesBefore, setFramesBefore] = useState(3);
  const [framesAfter, setFramesAfter] = useState(3);
  const [motionStrength, setMotionStrength] = useState<"subtle" | "small" | "medium">("small");

  const [saveRoot, setSaveRoot] = useState("");
  const [defaultSaveRoot, setDefaultSaveRoot] = useState("");

  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/save-root");
      const j = await r.json();
      setDefaultSaveRoot(j.defaultSaveRoot);
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem(LS_SAVE_ROOT) : null;
      setSaveRoot(saved || j.defaultSaveRoot);
    })();
  }, []);

  const append = (kind: string, text: string) =>
    setLogs((p) => {
      const next = [...p, { kind, text, ts: Date.now() }];
      queueMicrotask(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      return next;
    });

  // File System Access API でフォルダ選択 (Chromium のみ)。
  // 取得した DirectoryHandle 自体はサーバーに渡せないので、
  // 名前ヒントを表示しつつ、ユーザーに絶対パスを確認してもらう。
  const pickFolder = async () => {
    // @ts-expect-error: showDirectoryPicker
    if (typeof window.showDirectoryPicker !== "function") {
      append("info", "このブラウザはフォルダ選択ダイアログ非対応です。パス欄に絶対パスを入力してください。");
      return;
    }
    try {
      // @ts-expect-error: showDirectoryPicker
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      append("info", `選択フォルダ名: ${handle.name} (絶対パスはブラウザから取得できません。下の欄に確認入力してください)`);
    } catch {
      // user cancelled
    }
  };

  const persistSaveRoot = async () => {
    const r = await fetch("/api/save-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: saveRoot }),
    });
    if (!r.ok) {
      append("error", await r.text());
      return false;
    }
    const j = await r.json();
    setSaveRoot(j.saveRoot);
    localStorage.setItem(LS_SAVE_ROOT, j.saveRoot);
    append("info", `保存先 OK: ${j.saveRoot}`);
    return true;
  };

  const start = async () => {
    if (!image) return append("error", "画像を選択してください");
    if (!prompt.trim()) return append("error", "指示テキストを入力してください");
    if (!saveRoot.trim()) return append("error", "保存先フォルダを指定してください");

    setBusy(true);
    setLogs([]);
    setResult(null);

    const fd = new FormData();
    fd.append("image", image);
    fd.append("saveRoot", saveRoot.trim());
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
        if (data.savedTo) append("info", `保存先: ${String(data.savedTo)}`);
        return;
      case "step":
        append(String(data.kind ?? "info"), String(data.text ?? ""));
        return;
      case "delta":
      case "reasoning_delta":
      case "cmd_output":
      case "heartbeat":
        return;
      case "agent":
        append("agent", String(data.text ?? ""));
        return;
      case "stderr":
        append("stderr", String(data.text ?? ""));
        return;
      case "error":
        append("err", String(data.message ?? "error"));
        return;
      case "done":
        append("done", "★ 完成");
        setResult(data as unknown as Result);
        return;
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6 grid gap-6">
      <header className="dq-frame">
        <h1 className="text-base mb-2">* ANIMEMAKER *</h1>
        <p className="text-[10px] opacity-80">
          キャラクター ガゾウ カラ ゲーム ソザイ ヲ セイセイ
        </p>
      </header>

      {/* 保存先 */}
      <section className="dq-frame">
        <h2 className="text-xs mb-3">▼ ホゾンサキ フォルダ</h2>
        <input
          type="text"
          placeholder={defaultSaveRoot}
          value={saveRoot}
          onChange={(e) => setSaveRoot(e.target.value)}
        />
        <div className="flex gap-2 mt-3 flex-wrap">
          <button className="dq-btn" onClick={pickFolder} type="button">フォルダ センタク</button>
          <button className="dq-btn" onClick={persistSaveRoot} type="button">パス カクニン / サクセイ</button>
          <button
            className="dq-btn"
            onClick={() => setSaveRoot(defaultSaveRoot)}
            type="button"
          >
            デスクトップ ニ モドス
          </button>
        </div>
        <p className="text-[10px] opacity-70 mt-3">
          シテイ シタ フォルダ ノ ナカ ニ ジョブゴト ノ サブフォルダ ガ ジドウ サクセイ サレマス。
        </p>
      </section>

      {/* 入力 */}
      <section className="dq-frame grid gap-3">
        <div>
          <label className="text-xs">▼ モード</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="pose">ポーズ サクセイ モード</option>
            <option value="animation">アニメーション モード (ゼンゴ 3フレーム ケイ 7マイ)</option>
          </select>
        </div>

        <div>
          <label className="text-xs">▼ キジュン キャラクター ガゾウ</label>
          <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        </div>

        <div>
          <label className="text-xs">▼ シジ テキスト</label>
          <textarea
            rows={3}
            placeholder={
              mode === "pose"
                ? "レイ: コウゲキマエ ノ カマエ"
                : "レイ: ケン ヲ フリオロス ドウサ"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs">▼ ハイケイショク (#FF00FF)</label>
            <input value={bg} placeholder="ジドウ" onChange={(e) => setBg(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">▼ シュツリョク サイズ</label>
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option>1024x1024</option>
              <option>1024x1536</option>
              <option>1536x1024</option>
            </select>
          </div>
        </div>

        {mode === "animation" && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs">▼ マエ フレーム</label>
              <input
                type="number"
                min={0}
                max={6}
                value={framesBefore}
                onChange={(e) => setFramesBefore(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="text-xs">▼ アト フレーム</label>
              <input
                type="number"
                min={0}
                max={6}
                value={framesAfter}
                onChange={(e) => setFramesAfter(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="text-xs">▼ ウゴキ ノ ツヨサ</label>
              <select
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

        <div className="mt-2">
          <button className="dq-btn" onClick={start} disabled={busy}>
            {busy ? "セイセイ チュウ..." : "セイセイ スル"}
          </button>
        </div>
      </section>

      {(logs.length > 0 || busy) && (
        <section className="dq-frame">
          <h2 className="text-xs mb-2">▼ シンチョク</h2>
          <div className="dq-log">
            {logs.map((l, i) => (
              <div key={i} className={kindClass(l.kind)}>
                <span className="opacity-60 mr-2">[{l.kind}]</span>
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
      )}

      {result && (
        <section className="dq-frame">
          <h2 className="text-xs mb-3">▼ ケッカ</h2>
          <p className="text-[10px] opacity-80 mb-3">
            ホゾンサキ: {result.savedTo}
          </p>
          {result.mode === "pose" ? (
            <div className="dq-cell">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.imageUrl} alt="pose" />
              <a href={result.imageUrl} download>PNG ダウンロード</a>
            </div>
          ) : (
            <>
              <p className="mb-3">
                <a href={result.zipUrl} download>ZIP ダウンロード (レンバン + manifest)</a>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {result.frames
                  .slice()
                  .sort((a, b) => a.index - b.index)
                  .map((f) => (
                    <div key={f.index} className={`dq-cell ${f.ok ? "" : "failed"}`}>
                      <div>frame {f.index}</div>
                      {f.ok ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.file} alt={`frame ${f.index}`} />
                          <a href={f.file} download>DL</a>
                        </>
                      ) : (
                        <div>シッパイ</div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function kindClass(kind: string): string {
  if (kind === "err" || kind === "error" || kind === "command-err") return "err";
  if (kind === "done" || kind === "command-ok" || kind === "file-ok") return "done";
  if (kind === "agent") return "agent";
  return "";
}
