import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import { paths, ensureDir, newId } from "@/lib/paths";
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

  if (!(image instanceof File)) return new Response("image is required", { status: 400 });
  if (!motionPrompt) return new Response("motionPrompt is required", { status: 400 });

  const id = newId("anim");
  const cwd = paths.jobDir(id);
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
    initData: { id, mode: "animation", framesBefore, framesAfter },
    finalize: () => {
      const frames: Array<{ index: number; file: string; ok: boolean }> = [];
      for (let i = -framesBefore; i <= framesAfter; i++) {
        const fname = frameFileName(i);
        const ok = fs.existsSync(path.join(cwd, fname));
        frames.push({ index: i, file: `/api/jobs/${id}/${fname}`, ok });
      }
      const okCount = frames.filter((f) => f.ok).length;
      if (okCount === 0) throw new Error("フレームが 1 枚も生成されませんでした");

      const zip = new AdmZip();
      for (const f of frames) {
        if (!f.ok) continue;
        const local = path.join(cwd, path.basename(f.file));
        zip.addLocalFile(local);
      }
      const manifestPath = path.join(cwd, "manifest.json");
      if (fs.existsSync(manifestPath)) zip.addLocalFile(manifestPath);
      const zipName = `${id}.zip`;
      zip.writeZip(path.join(cwd, zipName));

      return {
        id,
        mode: "animation",
        frames,
        zipUrl: `/api/jobs/${id}/${zipName}`,
      };
    },
  });
}

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
