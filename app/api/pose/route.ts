import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { paths, ensureDir, newId } from "@/lib/paths";
import { buildPoseCodexPrompt } from "@/lib/prompt";
import { runJobStream, saveReferenceImage } from "@/lib/runJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const image = form.get("image");
  const posePrompt = String(form.get("posePrompt") ?? "").trim();
  const backgroundColor = String(form.get("backgroundColor") ?? "").trim() || undefined;
  const size = String(form.get("size") ?? "1024x1024");

  if (!(image instanceof File)) return new Response("image is required", { status: 400 });
  if (!posePrompt) return new Response("posePrompt is required", { status: 400 });

  const id = newId("pose");
  const cwd = paths.jobDir(id);
  ensureDir(cwd);
  await saveReferenceImage(image, cwd);

  const prompt = buildPoseCodexPrompt({ posePrompt, backgroundColor, size });
  fs.writeFileSync(path.join(cwd, "prompt.txt"), prompt, "utf8");

  return runJobStream({
    cwd,
    prompt,
    serviceName: "animemaker-pose",
    req,
    initData: { id, mode: "pose" },
    finalize: () => {
      const out = path.join(cwd, "pose.png");
      if (!fs.existsSync(out)) {
        throw new Error("pose.png が生成されませんでした");
      }
      return {
        id,
        mode: "pose",
        imageUrl: `/api/jobs/${id}/pose.png`,
      };
    },
  });
}
