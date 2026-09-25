import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/ONNX deps for the local CLIP beach-photo check
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
