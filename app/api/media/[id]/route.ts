import { readMedia } from "@/lib/store";

export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const data = await readMedia(id);
  if (!data) return new Response("not found", { status: 404 });
  const type = id.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const headers = { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes" };

  // Safari needs byte ranges for <video>
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
    return new Response(new Uint8Array(data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${data.length}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
}
