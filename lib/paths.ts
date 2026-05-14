import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// デフォルトはユーザーのデスクトップ配下の AnimeMaker フォルダ。
function defaultSaveRoot(): string {
  return path.join(os.homedir(), "Desktop", "AnimeMaker");
}

export function resolveSaveRoot(userSpecified?: string): string {
  const raw = (userSpecified || "").trim();
  if (!raw) return defaultSaveRoot();
  // ~ 展開
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  // 絶対パスのみ許可
  if (!path.isAbsolute(raw)) {
    throw new Error(`保存先は絶対パスで指定してください: ${raw}`);
  }
  return raw;
}

export function jobDirUnder(saveRoot: string, id: string): string {
  return path.join(saveRoot, id);
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function newId(prefix: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rnd}`;
}

// クライアントへ既定パスを伝えるための定数 (表示用)
export const DEFAULT_SAVE_ROOT = defaultSaveRoot();
