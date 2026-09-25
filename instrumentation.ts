export async function register() {
  // Warm the CLIP model in the background so the first search doesn't pay the load time
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.USE_REAL_PHOTO !== "false") {
    const { loadClassifier } = await import("./lib/photo");
    loadClassifier().catch((e) => console.warn("CLIP warmup failed:", e.message));
  }
}
