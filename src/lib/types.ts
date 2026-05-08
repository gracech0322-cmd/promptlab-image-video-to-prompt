export const TARGET_MODELS = [
  { id: "seedance-2.0", label: "Seedance 2.0" },
  { id: "generic-ai-video", label: "Others" }
] as const;

export type TargetModelId = (typeof TARGET_MODELS)[number]["id"];

export const DEFAULT_TARGET_MODEL: TargetModelId = "seedance-2.0";
export const GEMINI_ANALYSIS_MODEL = "gemini-2.5-flash";
export const FRAME_SAMPLING_MODES = ["fast", "standard", "detailed"] as const;
export const DEFAULT_FRAME_SAMPLING_MODE = "standard";

export type FrameSamplingMode = (typeof FRAME_SAMPLING_MODES)[number];
export type FrameExtractionOptions = {
  mode?: FrameSamplingMode;
};

export type AnalysisMediaType = "video" | "image";
export type AnalysisSourceType = "web" | "local";

export type DetectedVideoInfo = {
  found: boolean;
  duration?: number;
  currentTime?: number;
  videoWidth?: number;
  videoHeight?: number;
  src?: string;
  pageTitle?: string;
  pageUrl?: string;
};

export type DetectedImageInfo = {
  found: boolean;
  imageWidth?: number;
  imageHeight?: number;
  src?: string;
  pageTitle?: string;
  pageUrl?: string;
  alt?: string;
};

export type ExtractedFrame = {
  timestamp: number;
  dataUrl: string;
};

export type AnalysisPhase =
  | "idle"
  | "ready"
  | "detecting"
  | "extracting"
  | "analyzing"
  | "generated"
  | "error";

export type AnalysisState = {
  tabId: number | null;
  phase: AnalysisPhase;
  statusText: string;
  errorMessage?: string;
  videoSummary?: string;
  imageSummary?: string;
  generatedPrompt?: string;
  rawResult?: string;
  promptResult?: GeminiPromptResponse;
  mediaType?: AnalysisMediaType;
  sourceType?: AnalysisSourceType;
  videoInfo?: DetectedVideoInfo;
  imageInfo?: DetectedImageInfo;
  previewFrameUrl?: string;
  keyframeCount?: number;
  targetModel: TargetModelId;
  updatedAt: number;
};

export type StoredSettings = {
  geminiApiKey: string;
  targetModel: TargetModelId;
  frameSamplingMode: FrameSamplingMode;
};

export type PromptHistoryItem = {
  id: string;
  createdAt: number;
  sourceType: AnalysisSourceType;
  mediaType: AnalysisMediaType;
  sourceUrl?: string;
  pageTitle?: string;
  thumbnailDataUrl?: string;
  promptText: string;
  videoSummary?: string;
};

export type GeneratedPromptTimelineItem = {
  time: string;
  description: string;
};

export type GeneratedPromptBody = {
  openingLine: string;
  mainSubject: string;
  scene: string;
  timeline: GeneratedPromptTimelineItem[];
  camera: string;
  motion: string;
  lighting: string;
  style: string;
  qualityConstraints: string;
};

export type GeminiVideoPromptResponse = {
  videoSummary: string;
  targetModel: string;
  generatedPrompt: GeneratedPromptBody;
};

export type GeminiImageAnalysisBody = {
  subject: string;
  scene: string;
  composition: string;
  style: string;
  lighting: string;
  colorPalette: string;
  mood: string;
  details: string;
  medium: string;
  keywords: string[];
};

export type GeminiImagePromptResponse = {
  analysis: GeminiImageAnalysisBody;
  shortPrompt: string;
  detailedPrompt: string;
  imagePrompt: string;
};

export type GeminiPromptResponse = GeminiVideoPromptResponse | GeminiImagePromptResponse;

export type RuntimeMessage =
  | {
      type: "VIDEO2PROMPT_START_ANALYSIS";
      tabId?: number;
      triggeredFrom: "contextMenu" | "sidePanel";
      imageUrl?: string;
    }
  | {
      type: "VIDEO2PROMPT_GET_PANEL_CONTEXT";
    }
  | {
      type: "VIDEO2PROMPT_ANALYSIS_STATE_UPDATED";
      state: AnalysisState;
    }
  | {
      type: "VIDEO2PROMPT_FOCUS_API_KEY";
    }
  | {
      type: "VIDEO2PROMPT_CLEAR_ACTIVE_ANALYSIS";
      tabId?: number;
    };
