import {
  buildPromptEnhancerImageInstruction,
  buildPromptEnhancerVideoInstruction,
  type PromptEnhancerMode
} from "./prompts/enhancer";
import {
  GEMINI_IMAGE_RESPONSE_SCHEMA,
  GEMINI_VIDEO_RESPONSE_SCHEMA,
  buildGeminiImageInstruction,
  buildGeminiVideoInstruction,
  parseGeminiImageResponse,
  parseGeminiVideoResponse
} from "./promptTemplates";
import {
  GEMINI_ANALYSIS_MODEL,
  type DetectedImageInfo,
  type DetectedVideoInfo,
  type ExtractedFrame,
  type TargetModelId
} from "./types";

function dataUrlToInlinePart(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported frame format.");
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function inferMimeTypeFromUrl(imageUrl: string): string {
  const pathname = new URL(imageUrl).pathname.toLowerCase();
  if (pathname.endsWith(".png")) {
    return "image/png";
  }
  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }
  if (pathname.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}

function readGeminiError(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return null;
}

function readGeminiText(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "candidates" in payload &&
    Array.isArray(payload.candidates)
  ) {
    const textParts = payload.candidates
      .flatMap((candidate) => {
        if (
          !candidate ||
          typeof candidate !== "object" ||
          !("content" in candidate) ||
          !candidate.content ||
          typeof candidate.content !== "object" ||
          !("parts" in candidate.content) ||
          !Array.isArray(candidate.content.parts)
        ) {
          return [];
        }

        return candidate.content.parts.flatMap((part: unknown) => {
          if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
            return [part.text];
          }
          return [];
        });
      })
      .join("\n")
      .trim();

    if (textParts) {
      return textParts;
    }
  }

  throw new Error("Gemini did not return a valid prompt. Please try again.");
}

export async function analyzeVideoFramesWithGemini({
  apiKey,
  targetModel,
  frames,
  videoInfo
}: {
  apiKey: string;
  targetModel: TargetModelId;
  frames: ExtractedFrame[];
  videoInfo?: DetectedVideoInfo;
}): Promise<ReturnType<typeof parseGeminiVideoResponse>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ANALYSIS_MODEL}:generateContent`;
  const instruction = buildGeminiVideoInstruction(targetModel, videoInfo);

  const frameParts = frames.flatMap((frame, index) => {
    const inlineData = dataUrlToInlinePart(frame.dataUrl);

    return [
      {
        text: `Frame ${index + 1} at ${frame.timestamp.toFixed(2)} seconds`
      },
      {
        inline_data: inlineData
      }
    ];
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: instruction }, ...frameParts]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_VIDEO_RESPONSE_SCHEMA,
        temperature: 0.4,
        topP: 0.9
      }
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      readGeminiError(payload) ??
        "Gemini API request failed. Please check your API key, quota, or network connection."
    );
  }

  const text = readGeminiText(payload);
  return parseGeminiVideoResponse(text);
}

export async function analyzeImageWithGemini({
  apiKey,
  targetModel,
  imageUrl,
  imageDataUrl,
  imageInfo
}: {
  apiKey: string;
  targetModel: TargetModelId;
  imageUrl?: string;
  imageDataUrl?: string;
  imageInfo?: DetectedImageInfo;
}): Promise<ReturnType<typeof parseGeminiImageResponse>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ANALYSIS_MODEL}:generateContent`;
  const instruction = buildGeminiImageInstruction(targetModel, imageInfo);
  const imagePart = imageUrl
    ? {
        file_data: {
          mime_type: inferMimeTypeFromUrl(imageUrl),
          file_uri: imageUrl
        }
      }
    : imageDataUrl
      ? {
          inline_data: dataUrlToInlinePart(imageDataUrl)
        }
      : null;

  if (!imagePart) {
    throw new Error("No image data was provided for analysis.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: instruction },
            imagePart
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_IMAGE_RESPONSE_SCHEMA,
        temperature: 0.4,
        topP: 0.9
      }
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      readGeminiError(payload) ??
        "Gemini API request failed. Please check your API key, quota, or network connection."
    );
  }

  const text = readGeminiText(payload);
  return parseGeminiImageResponse(text);
}

function cleanEnhancedPrompt(text: string): string {
  return text
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^(?:enhanced\s+prompt|video\s+prompt|image\s+prompt|final\s+prompt|prompt)\s*:\s*/i, "")
    .trim();
}

export async function enhancePromptWithGemini({
  apiKey,
  mode,
  idea
}: {
  apiKey: string;
  mode: PromptEnhancerMode;
  idea: string;
}): Promise<string> {
  const trimmedIdea = idea.trim();
  if (!trimmedIdea) {
    throw new Error("Enter a short idea first.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ANALYSIS_MODEL}:generateContent`;

  if (mode === "video") {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPromptEnhancerVideoInstruction(trimmedIdea) }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: GEMINI_VIDEO_RESPONSE_SCHEMA,
          temperature: 0.45,
          topP: 0.9
        }
      })
    });

    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(
        readGeminiError(payload) ??
          "Gemini API request failed. Please check your API key, quota, or network connection."
      );
    }

    const text = readGeminiText(payload);
    return parseGeminiVideoResponse(text).generatedPrompt;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPromptEnhancerImageInstruction(trimmedIdea) }]
        }
      ],
      generationConfig: {
        temperature: 0.55,
        topP: 0.9
      }
    })
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      readGeminiError(payload) ??
        "Gemini API request failed. Please check your API key, quota, or network connection."
    );
  }

  const prompt = cleanEnhancedPrompt(readGeminiText(payload));
  if (!prompt) {
    throw new Error("Gemini did not return a valid prompt. Please try again.");
  }

  return prompt;
}
