// One-off: generate the calm landing-page horizon with FLUX 3 → public/hero.mp4
// Usage: node --env-file=.env.local scripts/make-hero.mjs
import { writeFileSync } from "fs";

const key = process.env.BFL_API_KEY;
if (!key) throw new Error("BFL_API_KEY missing");
const model = process.env.BFL_VIDEO_MODEL || "flux-3-video";

const prompt = [
  "A calm, meditative, perfectly still wide shot of the open ocean at dusk, a long unbroken flat horizon exactly across the middle of the frame.",
  "Gentle low swells rolling slowly toward the camera, soft glowing light where the sun has just set on the horizon, deep navy blue sky fading to warm peach at the horizon line.",
  "Locked-off camera, no movement, no people, no boats, no birds, no text. Seamless, loopable, cinematic, minimalist, 35mm film.",
  "Audio: soft distant surf.",
].join(" ");

const res = await fetch(`https://api.bfl.ai/v1/${model}`, {
  method: "POST",
  headers: { "x-key": key, "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "t2v", prompt, duration: 10, aspect_ratio: "16:9", resolution: "fhd", generate_audio: false }),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { polling_url } = await res.json();
console.log("submitted, polling…");

for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await (await fetch(polling_url, { headers: { "x-key": key } })).json();
  process.stdout.write(`\r${r.status}        `);
  if (r.status === "Ready") {
    writeFileSync("public/hero.mp4", Buffer.from(await (await fetch(r.result.sample)).arrayBuffer()));
    console.log("\nsaved public/hero.mp4");
    break;
  }
  if (["Error", "Request Moderated", "Content Moderated", "Task not found", "Failed"].includes(r.status)) throw new Error(JSON.stringify(r));
}
