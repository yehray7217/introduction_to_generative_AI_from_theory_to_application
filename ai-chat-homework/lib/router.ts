import type { ImageAttachment, RoutingInfo } from "./types";
import { getModelConfig } from "./models";

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function routeRequest({
  text,
  images,
  preferredModel,
  autoRouting,
}: {
  text: string;
  images: ImageAttachment[];
  preferredModel?: string;
  autoRouting: boolean;
}): RoutingInfo {
  const models = getModelConfig(preferredModel);
  const lowerText = text.toLowerCase();

  if (!autoRouting) {
    return {
      taskType: "general",
      selectedModel: preferredModel || models.general,
      reason: "Auto routing disabled. Using the manually selected model.",
    };
  }

  if (images.length > 0) {
    return {
      taskType: "vision",
      selectedModel: models.vision,
      reason: "Image attachment detected, so the request is routed to a vision-capable model.",
    };
  }

  if (
    containsAny(lowerText, [
      "```",
      "typescript",
      "javascript",
      "python",
      "cuda",
      "debug",
      "bug",
      "code",
      "function",
      "class",
      "compiler",
      "error",
      "stack trace",
      "程式",
      "除錯",
      "錯誤",
    ])
  ) {
    return {
      taskType: "coding",
      selectedModel: models.coding,
      reason: "Programming-related keywords detected, so the request is routed to the coding model.",
    };
  }

  if (
    containsAny(lowerText, ["remember that", "記住", "save memory", "what do you remember", "你記得", "memory"])
  ) {
    return {
      taskType: "memory",
      selectedModel: models.fast,
      reason: "Memory-related intent detected, so the request is routed to a faster model with memory tools enabled.",
    };
  }

  if (
    /\d+\s*[+\-*/^%]\s*\d+/.test(lowerText) ||
    containsAny(lowerText, ["calculate", "calculator", "compute", "算", "計算"])
  ) {
    return {
      taskType: "math",
      selectedModel: models.fast,
      reason: "Calculation intent detected, so the request is routed to a fast model and calculator tool.",
    };
  }

  if (containsAny(lowerText, ["time", "date", "today", "now", "幾點", "今天", "現在"])) {
    return {
      taskType: "tool",
      selectedModel: models.fast,
      reason: "Time/date intent detected, so the request is routed to a fast model and time tool.",
    };
  }

  return {
    taskType: "general",
    selectedModel: models.general,
    reason: "No special modality or tool intent detected. Using the default general chat model.",
  };
}
