import {
  GEMINI_IMAGE_RESPONSE_SCHEMA,
  buildGeminiImageInstruction
} from "./prompts/image";
import {
  GEMINI_VIDEO_RESPONSE_SCHEMA,
  buildGeminiVideoInstruction,
  getTargetModelLabel
} from "./prompts/video";
import type {
  GeminiImagePromptResponse,
  GeminiPromptResponse,
  GeminiVideoPromptResponse
} from "./types";

export {
  GEMINI_IMAGE_RESPONSE_SCHEMA,
  GEMINI_VIDEO_RESPONSE_SCHEMA,
  buildGeminiImageInstruction,
  buildGeminiVideoInstruction,
  getTargetModelLabel
};

function extractJsonSubstring(rawText: string): string | null {
  const start = rawText.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return rawText.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseGeminiJson<T>(rawText: string): T {
  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const jsonSubstring = extractJsonSubstring(trimmed);
    if (!jsonSubstring) {
      throw new Error("Gemini returned an invalid response format. Please try again.");
    }

    try {
      return JSON.parse(jsonSubstring) as T;
    } catch {
      throw new Error("Gemini returned an invalid response format. Please try again.");
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stripPromptLabel(value: string): string {
  return value
    .replace(
      /^(?:image\s+prompt|final\s+prompt|prompt|detailed\s+prompt|short\s+prompt)\s*:\s*/i,
      ""
    )
    .trim();
}

function normalizeVideoResponse(response: GeminiVideoPromptResponse): GeminiVideoPromptResponse {
  const timeline = response.generatedPrompt?.timeline;
  const normalizedTimeline = Array.isArray(timeline)
    ? timeline
        .filter(
          (item): item is { time: string; description: string } =>
            !!item &&
            typeof item === "object" &&
            isNonEmptyString((item as { time?: unknown }).time) &&
            isNonEmptyString((item as { description?: unknown }).description)
        )
        .map((item) => ({
          time: item.time.trim(),
          description: item.description.trim()
        }))
    : [];

  const normalized: GeminiVideoPromptResponse = {
    videoSummary: response.videoSummary?.trim?.() ?? "",
    targetModel: response.targetModel?.trim?.() ?? "",
    generatedPrompt: {
      openingLine: response.generatedPrompt?.openingLine?.trim?.() ?? "",
      mainSubject: response.generatedPrompt?.mainSubject?.trim?.() ?? "",
      scene: response.generatedPrompt?.scene?.trim?.() ?? "",
      timeline: normalizedTimeline,
      camera: response.generatedPrompt?.camera?.trim?.() ?? "",
      motion: response.generatedPrompt?.motion?.trim?.() ?? "",
      lighting: response.generatedPrompt?.lighting?.trim?.() ?? "",
      style: response.generatedPrompt?.style?.trim?.() ?? "",
      qualityConstraints: response.generatedPrompt?.qualityConstraints?.trim?.() ?? ""
    }
  };

  const prompt = normalized.generatedPrompt;
  const isValid =
    isNonEmptyString(normalized.videoSummary) &&
    isNonEmptyString(normalized.targetModel) &&
    isNonEmptyString(prompt.openingLine) &&
    isNonEmptyString(prompt.mainSubject) &&
    isNonEmptyString(prompt.scene) &&
    prompt.timeline.length > 0 &&
    isNonEmptyString(prompt.camera) &&
    isNonEmptyString(prompt.motion) &&
    isNonEmptyString(prompt.lighting) &&
    isNonEmptyString(prompt.style) &&
    isNonEmptyString(prompt.qualityConstraints);

  if (!isValid) {
    throw new Error("Gemini returned an invalid response format. Please try again.");
  }

  return normalized;
}

function normalizeImageResponse(response: GeminiImagePromptResponse): GeminiImagePromptResponse {
  const keywords = Array.isArray(response.analysis?.keywords)
    ? response.analysis.keywords
        .filter(isNonEmptyString)
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    : [];

  const normalized: GeminiImagePromptResponse = {
    analysis: {
      subject: response.analysis?.subject?.trim?.() ?? "",
      scene: response.analysis?.scene?.trim?.() ?? "",
      composition: response.analysis?.composition?.trim?.() ?? "",
      style: response.analysis?.style?.trim?.() ?? "",
      lighting: response.analysis?.lighting?.trim?.() ?? "",
      colorPalette: response.analysis?.colorPalette?.trim?.() ?? "",
      mood: response.analysis?.mood?.trim?.() ?? "",
      details: response.analysis?.details?.trim?.() ?? "",
      medium: response.analysis?.medium?.trim?.() ?? "",
      keywords
    },
    shortPrompt: response.shortPrompt?.trim?.() ?? "",
    detailedPrompt: response.detailedPrompt?.trim?.() ?? "",
    imagePrompt: response.imagePrompt?.trim?.() ?? ""
  };

  const analysis = normalized.analysis;
  const isValid =
    isNonEmptyString(analysis.subject) &&
    isNonEmptyString(analysis.scene) &&
    isNonEmptyString(analysis.composition) &&
    isNonEmptyString(analysis.style) &&
    isNonEmptyString(analysis.lighting) &&
    isNonEmptyString(analysis.colorPalette) &&
    isNonEmptyString(analysis.mood) &&
    isNonEmptyString(analysis.details) &&
    isNonEmptyString(analysis.medium) &&
    keywords.length > 0 &&
    isNonEmptyString(normalized.shortPrompt) &&
    isNonEmptyString(normalized.detailedPrompt) &&
    isNonEmptyString(normalized.imagePrompt);

  if (!isValid) {
    throw new Error("Gemini returned an invalid response format. Please try again.");
  }

  return normalized;
}

export function formatVideoPrompt(promptResult: GeminiVideoPromptResponse): string {
  const timelineText = promptResult.generatedPrompt.timeline
    .map((item) => `[${item.time}]: ${item.description}`)
    .join("\n");

  return [
    promptResult.generatedPrompt.openingLine,
    "",
    "Main subject:",
    promptResult.generatedPrompt.mainSubject,
    "",
    "Scene:",
    promptResult.generatedPrompt.scene,
    "",
    "Timeline:",
    timelineText,
    "",
    "Camera:",
    promptResult.generatedPrompt.camera,
    "",
    "Motion:",
    promptResult.generatedPrompt.motion,
    "",
    "Lighting:",
    promptResult.generatedPrompt.lighting,
    "",
    "Style:",
    promptResult.generatedPrompt.style,
    "",
    "Quality Constraints:",
    promptResult.generatedPrompt.qualityConstraints
  ].join("\n");
}

export function formatImagePrompt(promptResult: GeminiImagePromptResponse): string {
  return stripPromptLabel(promptResult.imagePrompt);
}

export function parseGeminiVideoResponse(rawText: string): {
  videoSummary: string;
  generatedPrompt: string;
  rawResult: string;
  promptResult: GeminiVideoPromptResponse;
} {
  const promptResult = normalizeVideoResponse(parseGeminiJson<GeminiVideoPromptResponse>(rawText));
  const rawResult = JSON.stringify(promptResult, null, 2);

  return {
    videoSummary: promptResult.videoSummary,
    generatedPrompt: formatVideoPrompt(promptResult),
    rawResult,
    promptResult
  };
}

export function parseGeminiImageResponse(rawText: string): {
  imageSummary: string;
  generatedPrompt: string;
  rawResult: string;
  promptResult: GeminiImagePromptResponse;
} {
  const promptResult = normalizeImageResponse(parseGeminiJson<GeminiImagePromptResponse>(rawText));
  const rawResult = JSON.stringify(promptResult, null, 2);

  return {
    imageSummary: promptResult.shortPrompt,
    generatedPrompt: formatImagePrompt(promptResult),
    rawResult,
    promptResult
  };
}

export function parseGeminiResponse(rawText: string): {
  videoSummary: string;
  generatedPrompt: string;
  rawResult: string;
  promptResult: GeminiPromptResponse;
} {
  const result = parseGeminiVideoResponse(rawText);
  return {
    ...result,
    promptResult: result.promptResult
  };
}
