import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { resolveSaveRoot, jobDirUnder, ensureDir, newId } from "@/lib/paths";
import { buildAnimationCodexPrompt, frameFileName } from "@/lib/prompt";
import { runJobStream, saveReferenceImage } from "@/lib/runJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const image = form.get("image");
  const motionPrompt = String(form.get("motionPrompt") ?? "").trim();
  const framesBefore = clamp(parseInt(String(form.get("framesBefore") ?? "3"), 10), 0, 6, 3);
  const framesAfter = clamp(parseInt(String(form.get("framesAfter") ?? "3"), 10), 0, 6, 3);
  const motionStrength = (["subtle", "small", "medium"].includes(String(form.get("motionStrength")))
    ? String(form.get("motionStrength"))
    : "small") as "subtle" | "small" | "medium";
  const backgroundColor = String(form.get("backgroundColor") ?? "").trim() || undefined;
  const size = String(form.get("size") ?? "1024x1024");
  const saveRoot = resolveSaveRoot(String(form.get("saveRoot") ?? ""));

  if (!(image instanceof File)) return new Response("image is required", { status: 400 });
  if (!motionPrompt) return new Response("motionPrompt is required", { status: 400 });

  const id = newId("anim");
  const cwd = jobDirUnder(saveRoot, id);
  ensureDir(cwd);
  await saveReferenceImage(image, cwd);

  const prompt = buildAnimationCodexPrompt({
    motionPrompt,
    framesBefore,
    framesAfter,
    motionStrength,
    backgroundColor,
    size,
  });
  fs.writeFileSync(path.join(cwd, "prompt.txt"), prompt, "utf8");

  return runJobStream({
    cwd,
    prompt,
    serviceName: "animemaker-animation",
    req,
    initData: { id, mode: "animation", framesBefore, framesAfter, savedTo: cwd },
    finalize: () => {
      const frames: Array<{ index: number; file: string; ok: boolean }> = [];
      for (let i = -framesBefore; i <= framesAfter; i++) {
        const fname = frameFileName(i);
        const ok = fs.existsSync(path.join(cwd, fname));
        frames.push({
          index: i,
          file: `/api/jobs/file?dir=${encodeURIComponent(cwd)}&file=${encodeURIComponent(fname)}`,
          ok,
        });
      }
      const okCount = frames.filter((f) => f.ok).length;
      if (okCount === 0) throw new Error("フレームが 1 枚も生成されませんでした");

      const zip = new AdmZip();
      for (let i = -framesBefore; i <= framesAfter; i++) {
        const fname = frameFileName(i);
        const local = path.join(cwd, fname);
        if (fs.existsSync(local)) zip.addLocalFile(local);
      }
      const manifestPath = path.join(cwd, "manifest.json");
      if (fs.existsSync(manifestPath)) zip.addLocalFile(manifestPath);
      const zipName = `${id}.zip`;
      zip.writeZip(path.join(cwd, zipName));

      return {
        id,
        mode: "animation",
        savedTo: cwd,
        frames,
        zipUrl: `/api/jobs/file?dir=${encodeURIComponent(cwd)}&file=${encodeURIComponent(zipName)}`,
      };
    },
  });
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
