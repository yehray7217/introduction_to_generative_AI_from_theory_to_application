export const FALLBACK_GENERAL_MODEL = "meta/llama-3.1-70b-instruct";
export const FALLBACK_CODING_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
export const FALLBACK_FAST_MODEL = "meta/llama-3.1-8b-instruct";

export function getModelConfig(preferredModel?: string) {
  return {
    general:
      preferredModel ||
      process.env.NVIDIA_GENERAL_MODEL ||
      process.env.NVIDIA_MODEL ||
      FALLBACK_GENERAL_MODEL,
    coding: process.env.NVIDIA_CODING_MODEL || FALLBACK_CODING_MODEL,
    vision: process.env.NVIDIA_VISION_MODEL || FALLBACK_VISION_MODEL,
    fast: process.env.NVIDIA_FAST_MODEL || FALLBACK_FAST_MODEL,
  };
}

export const UI_MODELS = [
  FALLBACK_GENERAL_MODEL,
  FALLBACK_CODING_MODEL,
  FALLBACK_VISION_MODEL,
  FALLBACK_FAST_MODEL,
  "microsoft/phi-3-small-128k-instruct",
  "moonshotai/kimi-k2-instruct-0905",
];
