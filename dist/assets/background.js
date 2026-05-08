// src/lib/types.ts
var TARGET_MODELS = [
  { id: "seedance-2.0", label: "Seedance 2.0" },
  { id: "generic-ai-video", label: "Others" }
];
var DEFAULT_TARGET_MODEL = "seedance-2.0";
var GEMINI_ANALYSIS_MODEL = "gemini-2.5-flash";
var DEFAULT_FRAME_SAMPLING_MODE = "standard";

// src/lib/prompts/image.ts
function targetModelLabel(targetModel) {
  return TARGET_MODELS.find((model) => model.id === targetModel)?.label ?? targetModel;
}
function inferImageAspectRatio(imageInfo) {
  if (!imageInfo?.imageWidth || !imageInfo.imageHeight) {
    return "the source image's aspect ratio";
  }
  const ratio = imageInfo.imageWidth / imageInfo.imageHeight;
  if (ratio > 1.7) {
    return "16:9";
  }
  if (ratio < 0.8) {
    return "9:16";
  }
  return "1:1 or 4:5";
}
var GEMINI_IMAGE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        subject: {
          type: "string"
        },
        scene: {
          type: "string"
        },
        composition: {
          type: "string"
        },
        style: {
          type: "string"
        },
        lighting: {
          type: "string"
        },
        colorPalette: {
          type: "string"
        },
        mood: {
          type: "string"
        },
        details: {
          type: "string"
        },
        medium: {
          type: "string"
        },
        keywords: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },
      required: [
        "subject",
        "scene",
        "composition",
        "style",
        "lighting",
        "colorPalette",
        "mood",
        "details",
        "medium",
        "keywords"
      ]
    },
    shortPrompt: {
      type: "string"
    },
    detailedPrompt: {
      type: "string"
    },
    imagePrompt: {
      type: "string"
    }
  },
  required: ["analysis", "shortPrompt", "detailedPrompt", "imagePrompt"]
};
function buildGeminiImageInstruction(targetModel, imageInfo) {
  const modelLabel = targetModelLabel(targetModel);
  return `You are an expert AI image prompt engineer.

Analyze the provided still image and generate image-oriented prompts for image generation, image reconstruction, and visual description.

The selected product target is: ${modelLabel}. Use that only as a broad quality target. Do not make this a video prompt.

Image metadata:
- Page title: ${imageInfo?.pageTitle ?? "Unknown"}
- Page URL: ${imageInfo?.pageUrl ?? "Unknown"}
- Source image URL: ${imageInfo?.src ?? "Unknown"}
- Source aspect ratio hint: ${inferImageAspectRatio(imageInfo)}
- Image alt hint: ${imageInfo?.alt ?? "Unknown"}

Focus on:
- subject
- scene / background
- composition
- style
- lighting
- color palette
- mood / atmosphere
- details / textures
- medium
- keywords

Avoid video-oriented concepts unless they are literally visible in the still image.
Do not emphasize camera movement, pacing, motion, transitions, key shots, timeline, or video generation.

Return valid JSON only.

Do not include Markdown.
Do not include code fences.
Do not include explanations outside the JSON.

The JSON must follow this exact image-specific structure:

{
  "analysis": {
    "subject": "Describe the primary subject, identity, visible appearance, pose, expression, clothing, and key distinguishing features.",
    "scene": "Describe the setting, background, environment, props, spatial context, and visible surroundings.",
    "composition": "Describe framing, crop, angle, perspective, focal point, depth, balance, negative space, and subject placement.",
    "style": "Describe the visual style, genre, aesthetic references, realism level, rendering approach, and artistic treatment.",
    "lighting": "Describe light source, direction, softness, contrast, shadows, highlights, exposure, and color temperature.",
    "colorPalette": "Describe dominant colors, accent colors, saturation, contrast, and color harmony.",
    "mood": "Describe the emotional tone, atmosphere, and overall feeling of the image.",
    "details": "Describe important small details, materials, textures, patterns, surface qualities, and background details.",
    "medium": "Describe the likely medium, such as photograph, editorial portrait, 3D render, illustration, product photo, anime still, oil painting, watercolor, or digital art.",
    "keywords": ["keyword", "keyword", "keyword"]
  },
  "shortPrompt": "A concise one-sentence internal summary of the image prompt.",
  "detailedPrompt": "An internal detailed draft that reconstructs the visual content, composition, style, lighting, colors, mood, medium, and textures.",
  "imagePrompt": "One complete, natural English image-generation prompt. It must be detailed and directly usable after copying. Include subject, scene, composition, style, lighting, color palette, mood, atmosphere, details, textures, and medium. Do not include labels, field names, Markdown, JSON, explanations, or model-specific parameter suffixes."
}

Keep every value in English. The imagePrompt value is the only user-facing result, so make it a single polished generation prompt. It must not start with "Image Prompt:", "Prompt:", "Subject:", "Scene:", "Style:", or "This image shows". Do not use Markdown, bullet points, JSON, field labels, or model-specific suffixes such as --ar.`;
}

// src/lib/promptTemplates.ts
function extractJsonSubstring(rawText) {
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
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
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
function parseGeminiJson(rawText) {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonSubstring = extractJsonSubstring(trimmed);
    if (!jsonSubstring) {
      throw new Error("Gemini returned an invalid response format. Please try again.");
    }
    try {
      return JSON.parse(jsonSubstring);
    } catch {
      throw new Error("Gemini returned an invalid response format. Please try again.");
    }
  }
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function stripPromptLabel(value) {
  return value.replace(
    /^(?:image\s+prompt|final\s+prompt|prompt|detailed\s+prompt|short\s+prompt)\s*:\s*/i,
    ""
  ).trim();
}
function normalizeImageResponse(response) {
  const keywords = Array.isArray(response.analysis?.keywords) ? response.analysis.keywords.filter(isNonEmptyString).map((keyword) => keyword.trim()).filter(Boolean) : [];
  const normalized = {
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
  const isValid = isNonEmptyString(analysis.subject) && isNonEmptyString(analysis.scene) && isNonEmptyString(analysis.composition) && isNonEmptyString(analysis.style) && isNonEmptyString(analysis.lighting) && isNonEmptyString(analysis.colorPalette) && isNonEmptyString(analysis.mood) && isNonEmptyString(analysis.details) && isNonEmptyString(analysis.medium) && keywords.length > 0 && isNonEmptyString(normalized.shortPrompt) && isNonEmptyString(normalized.detailedPrompt) && isNonEmptyString(normalized.imagePrompt);
  if (!isValid) {
    throw new Error("Gemini returned an invalid response format. Please try again.");
  }
  return normalized;
}
function formatImagePrompt(promptResult) {
  return stripPromptLabel(promptResult.imagePrompt);
}
function parseGeminiImageResponse(rawText) {
  const promptResult = normalizeImageResponse(parseGeminiJson(rawText));
  const rawResult = JSON.stringify(promptResult, null, 2);
  return {
    imageSummary: promptResult.shortPrompt,
    generatedPrompt: formatImagePrompt(promptResult),
    rawResult,
    promptResult
  };
}

// src/lib/geminiClient.ts
function dataUrlToInlinePart(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Unsupported frame format.");
  }
  return {
    mimeType: match[1],
    data: match[2]
  };
}
function inferMimeTypeFromUrl(imageUrl) {
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
function readGeminiError(payload) {
  if (payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return null;
}
function readGeminiText(payload) {
  if (payload && typeof payload === "object" && "candidates" in payload && Array.isArray(payload.candidates)) {
    const textParts = payload.candidates.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || !("content" in candidate) || !candidate.content || typeof candidate.content !== "object" || !("parts" in candidate.content) || !Array.isArray(candidate.content.parts)) {
        return [];
      }
      return candidate.content.parts.flatMap((part) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return [part.text];
        }
        return [];
      });
    }).join("\n").trim();
    if (textParts) {
      return textParts;
    }
  }
  throw new Error("Gemini did not return a valid prompt. Please try again.");
}
async function analyzeImageWithGemini({
  apiKey,
  targetModel,
  imageUrl,
  imageDataUrl,
  imageInfo
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ANALYSIS_MODEL}:generateContent`;
  const instruction = buildGeminiImageInstruction(targetModel, imageInfo);
  const imagePart = imageUrl ? {
    file_data: {
      mime_type: inferMimeTypeFromUrl(imageUrl),
      file_uri: imageUrl
    }
  } : imageDataUrl ? {
    inline_data: dataUrlToInlinePart(imageDataUrl)
  } : null;
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
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      readGeminiError(payload) ?? "Gemini API request failed. Please check your API key, quota, or network connection."
    );
  }
  const text = readGeminiText(payload);
  return parseGeminiImageResponse(text);
}

// src/lib/imageUtils.ts
function base64FromBytes(bytes) {
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
async function fetchImageAsDataUrl(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Could not load this image for analysis.");
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = base64FromBytes(new Uint8Array(arrayBuffer));
  return `data:${mimeType};base64,${base64}`;
}

// src/lib/storage.ts
var SETTINGS_KEY = "video2prompt:settings";
var ANALYSIS_KEY_PREFIX = "video2prompt:analysis:";
var defaultSettings = {
  geminiApiKey: "",
  targetModel: DEFAULT_TARGET_MODEL,
  frameSamplingMode: DEFAULT_FRAME_SAMPLING_MODE
};
function normalizeTargetModel(value) {
  if (TARGET_MODELS.some((model) => model.id === value)) {
    return value;
  }
  if (value === "happyhorse-1.0") {
    return "generic-ai-video";
  }
  return DEFAULT_TARGET_MODEL;
}
function normalizeFrameSamplingMode(value) {
  if (value === "fast" || value === "standard" || value === "detailed") {
    return value;
  }
  return DEFAULT_FRAME_SAMPLING_MODE;
}
function createAnalysisState(tabId, phase, statusText, targetModel, extras = {}) {
  return {
    tabId,
    phase,
    statusText,
    targetModel,
    updatedAt: Date.now(),
    ...extras
  };
}
async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const merged = {
    ...defaultSettings,
    ...stored[SETTINGS_KEY]
  };
  return {
    geminiApiKey: merged.geminiApiKey ?? "",
    targetModel: normalizeTargetModel(merged.targetModel),
    frameSamplingMode: normalizeFrameSamplingMode(merged.frameSamplingMode)
  };
}
function analysisStorageKey(tabId) {
  return `${ANALYSIS_KEY_PREFIX}${tabId}`;
}
async function getAnalysisState(tabId) {
  const key = analysisStorageKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return stored[key] ?? null;
}
async function saveAnalysisState(state) {
  if (state.tabId == null) {
    return;
  }
  await chrome.storage.local.set({
    [analysisStorageKey(state.tabId)]: state
  });
}
async function clearAnalysisState(tabId) {
  await chrome.storage.local.remove(analysisStorageKey(tabId));
}

// src/background/background.ts
var CONTEXT_MENU_ID = "analyze-image-to-prompt";
async function configureSidePanelBehavior() {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}
async function createContextMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Analyze Image to Prompt",
    contexts: ["image"]
  });
}
function toSerializableState(state) {
  return {
    ...state,
    updatedAt: Date.now()
  };
}
async function publishState(state) {
  const serializableState = toSerializableState(state);
  await saveAnalysisState(serializableState);
  try {
    await chrome.runtime.sendMessage({
      type: "VIDEO2PROMPT_ANALYSIS_STATE_UPDATED",
      state: serializableState
    });
  } catch {
  }
}
async function setState(tabId, phase, statusText, targetModel, extras = {}) {
  const state = createAnalysisState(tabId, phase, statusText, targetModel, extras);
  await publishState(state);
  return state;
}
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}
function openSidePanelForTab(tabId) {
  chrome.sidePanel.open({ tabId }).catch((error) => {
    console.error("PromptLab failed to open side panel.", error);
  });
}
function buildWebImageInfo(imageUrl, tab) {
  return {
    found: true,
    src: imageUrl,
    pageTitle: tab?.title,
    pageUrl: tab?.url
  };
}
async function startWebImageAnalysis({
  tabId,
  imageUrl
}) {
  const activeTab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : await getActiveTab();
  const resolvedTabId = activeTab?.id ?? null;
  const settings = await getSettings();
  const targetModel = settings.targetModel ?? DEFAULT_TARGET_MODEL;
  if (!resolvedTabId) {
    const state = createAnalysisState(
      null,
      "error",
      "Could not find an active tab to analyze.",
      targetModel,
      { errorMessage: "Could not find an active tab to analyze." }
    );
    await publishState(state);
    return { ok: false, state };
  }
  if (!settings.geminiApiKey) {
    const state = await setState(
      resolvedTabId,
      "error",
      "API key required. Enter your Gemini API key before analyzing images.",
      targetModel,
      {
        errorMessage: "API key required. Enter your Gemini API key before analyzing images."
      }
    );
    try {
      await chrome.runtime.sendMessage({
        type: "VIDEO2PROMPT_FOCUS_API_KEY"
      });
    } catch {
    }
    return { ok: false, state };
  }
  if (!imageUrl) {
    const state = await setState(
      resolvedTabId,
      "error",
      "No image was found. Please right-click directly on a standard webpage image and try again.",
      targetModel,
      {
        errorMessage: "No image was found. Please right-click directly on a standard webpage image and try again."
      }
    );
    return { ok: false, state };
  }
  const imageInfo = buildWebImageInfo(imageUrl, activeTab ?? void 0);
  await setState(resolvedTabId, "detecting", "Preparing image...", targetModel, {
    mediaType: "image",
    sourceType: "web",
    imageInfo,
    previewFrameUrl: imageUrl
  });
  try {
    await setState(resolvedTabId, "analyzing", "Analyzing with Gemini...", targetModel, {
      mediaType: "image",
      sourceType: "web",
      imageInfo,
      previewFrameUrl: imageUrl
    });
    let previewFrameUrl = imageUrl;
    let geminiResult;
    try {
      geminiResult = await analyzeImageWithGemini({
        apiKey: settings.geminiApiKey,
        targetModel,
        imageUrl,
        imageInfo
      });
    } catch {
      const imageDataUrl = await fetchImageAsDataUrl(imageUrl);
      previewFrameUrl = imageDataUrl;
      geminiResult = await analyzeImageWithGemini({
        apiKey: settings.geminiApiKey,
        targetModel,
        imageDataUrl,
        imageInfo
      });
    }
    const state = await setState(
      resolvedTabId,
      "generated",
      "Prompt generated.",
      targetModel,
      {
        mediaType: "image",
        sourceType: "web",
        imageInfo,
        previewFrameUrl,
        ...geminiResult
      }
    );
    return { ok: true, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load this image for analysis.";
    const state = await setState(resolvedTabId, "error", message, targetModel, {
      mediaType: "image",
      sourceType: "web",
      imageInfo,
      previewFrameUrl: imageUrl,
      errorMessage: message
    });
    return { ok: false, state };
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await configureSidePanelBehavior();
    await chrome.sidePanel.setOptions({
      path: "sidepanel.html",
      enabled: true
    });
    await createContextMenu();
  })();
});
chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    await configureSidePanelBehavior();
    await chrome.sidePanel.setOptions({
      path: "sidepanel.html",
      enabled: true
    });
  })();
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
    return;
  }
  openSidePanelForTab(tab.id);
  void startWebImageAnalysis({
    tabId: tab.id,
    imageUrl: info.srcUrl
  });
});
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    return;
  }
  openSidePanelForTab(tab.id);
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "VIDEO2PROMPT_START_ANALYSIS") {
    void startWebImageAnalysis({
      tabId: message.tabId,
      imageUrl: message.imageUrl
    }).then(sendResponse);
    return true;
  }
  if (message.type === "VIDEO2PROMPT_GET_PANEL_CONTEXT") {
    void (async () => {
      const activeTab = await getActiveTab();
      const activeTabId = activeTab?.id ?? null;
      const state = activeTabId ? await getAnalysisState(activeTabId) : null;
      sendResponse({
        activeTabId,
        state
      });
    })();
    return true;
  }
  if (message.type === "VIDEO2PROMPT_CLEAR_ACTIVE_ANALYSIS") {
    void (async () => {
      const activeTab = await getActiveTab();
      const resolvedTabId = message.tabId ?? activeTab?.id ?? null;
      if (!resolvedTabId) {
        sendResponse({ ok: false });
        return;
      }
      await clearAnalysisState(resolvedTabId);
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});
