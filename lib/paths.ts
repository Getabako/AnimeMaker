import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const ROOT =
  process.env.ANIMEMAKER_DATA_ROOT ?? path.join(os.homedir(), ".animemaker-data");

export const paths = {
  root: ROOT,
  jobs: path.join(ROOT, "jobs"),
  jobDir(id: string) {
    return path.join(ROOT, "jobs", id);
  },
};

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
