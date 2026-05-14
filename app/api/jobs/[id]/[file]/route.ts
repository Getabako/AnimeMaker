import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";

// ジョブディレクトリ配下のファイルを配信する。
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await ctx.params;
  if (!/^[\w.+-]+$/.test(id) || !/^[\w.+-]+\.(png|jpg|jpeg|json|zip|txt)$/i.test(file)) {
    return new Response("bad path", { status: 400 });
  }
  const full = path.join(paths.jobDir(id), file);
  if (!full.startsWith(paths.jobDir(id))) return new Response("forbidden", { status: 403 });
  if (!fs.existsSync(full)) return new Response("not found", { status: 404 });

  const buf = fs.readFileSync(full);
  const type =
    file.endsWith(".png") ? "image/png" :
    file.endsWith(".jpg") || file.endsWith(".jpeg") ? "image/jpeg" :
    file.endsWith(".json") ? "application/json; charset=utf-8" :
    file.endsWith(".zip") ? "application/zip" :
    "text/plain; charset=utf-8";

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    },
  });
}
