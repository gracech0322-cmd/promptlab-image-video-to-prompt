import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { analyzeImageWithGemini, analyzeVideoFramesWithGemini } from "../lib/geminiClient";
import { extractFrames } from "../lib/frameExtractor";
import { readFileAsDataUrl } from "../lib/imageUtils";
import {
  createAnalysisState,
  defaultSettings,
  deleteApiKey,
  deletePromptHistoryItem,
  getPromptHistory,
  getSettings,
  saveApiKey,
  saveFrameSamplingMode,
  savePromptHistoryItem
} from "../lib/storage";
import {
  DEFAULT_TARGET_MODEL,
  type AnalysisState,
  type AnalysisMediaType,
  type AnalysisSourceType,
  type DetectedImageInfo,
  type DetectedVideoInfo,
  type FrameSamplingMode,
  type PromptHistoryItem,
  type RuntimeMessage,
  type StoredSettings
} from "../lib/types";

type PanelContextResponse = {
  activeTabId: number | null;
  state: AnalysisState | null;
};

type StartAnalysisResponse = {
  ok: boolean;
  state: AnalysisState;
};

type PanelView = "main" | "history" | "settings";

type MediaSource =
  | { kind: "none" }
  | { kind: "web-image"; previewUrl?: string; imageInfo?: DetectedImageInfo }
  | { kind: "local-video"; objectUrl: string; fileName: string; videoInfo?: DetectedVideoInfo }
  | { kind: "local-image"; objectUrl: string; fileName: string; file: File; imageInfo?: DetectedImageInfo };

const FRAME_MODE_COPY: Record<
  FrameSamplingMode,
  { label: string; description: string }
> = {
  fast: {
    label: "Fast",
    description: "Faster and lighter. Uses fewer frames for quick prompt generation."
  },
  standard: {
    label: "Standard",
    description: "Recommended default. Balanced speed and quality for most local videos."
  },
  detailed: {
    label: "Detailed",
    description:
      "Uses more frames for complex motion, frequent transitions, ads, or deeper analysis."
  }
};

function SpinnerIcon() {
  return <span className="mini-spinner" aria-hidden="true" />;
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18L9 12L15 6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v4h4" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="M12 15h9" />
      <path d="M18 15v-3" />
      <path d="M21 15v-2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />
      <path d="M9.5 12.5l1.8 1.8l3.7-4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6 10-6s10 6 10 6s-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7h.01" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V9" />
      <path d="M9.5 11.5L12 9L14.5 11.5" />
      <path d="M20 16.8A4 4 0 0 0 17 10H15.7A6 6 0 1 0 4 12.5" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" className="tiny-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V7" />
      <path d="M8.5 10.5L12 7L15.5 10.5" />
      <path d="M20 16.8A4 4 0 0 0 17 10H15.7A6 6 0 1 0 4 12.5" />
      <path d="M8 16H16" />
    </svg>
  );
}

function buildLocalVideoInfo(video: HTMLVideoElement, fileName: string): DetectedVideoInfo {
  return {
    found: true,
    duration: Number.isFinite(video.duration) ? video.duration : undefined,
    currentTime: video.currentTime,
    videoWidth: video.videoWidth || undefined,
    videoHeight: video.videoHeight || undefined,
    src: fileName,
    pageTitle: "Local upload",
    pageUrl: "local://upload"
  };
}

function buildLocalImageInfo(image: HTMLImageElement, fileName: string): DetectedImageInfo {
  return {
    found: true,
    imageWidth: image.naturalWidth || undefined,
    imageHeight: image.naturalHeight || undefined,
    src: fileName,
    pageTitle: "Local upload",
    pageUrl: "local://upload"
  };
}

async function createVideoElement(sourceUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load the selected video file."));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.load();
  });
  return video;
}

async function createImageElement(sourceUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = sourceUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load the selected image file."));
  });

  return image;
}

async function compressThumbnailDataUrl(dataUrl?: string): Promise<string | undefined> {
  if (!dataUrl) {
    return undefined;
  }
  try {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load thumbnail image."));
    });
    const scale = Math.min(1, 320 / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      return dataUrl;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.68);
  } catch {
    return dataUrl;
  }
}

function createHistoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatHistoryTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(createdAt);
}

function getHistorySourceLabel(
  sourceType: AnalysisSourceType,
  mediaType: AnalysisMediaType
): string {
  if (sourceType === "local" && mediaType === "video") {
    return "Local video";
  }
  if (sourceType === "local" && mediaType === "image") {
    return "Local image";
  }
  return "Web image";
}

function getMediaAspectRatio(mediaSource: MediaSource): string | undefined {
  if (
    mediaSource.kind === "local-video" &&
    mediaSource.videoInfo?.videoWidth &&
    mediaSource.videoInfo?.videoHeight
  ) {
    return `${mediaSource.videoInfo.videoWidth} / ${mediaSource.videoInfo.videoHeight}`;
  }

  if (
    mediaSource.kind === "local-image" &&
    mediaSource.imageInfo?.imageWidth &&
    mediaSource.imageInfo?.imageHeight
  ) {
    return `${mediaSource.imageInfo.imageWidth} / ${mediaSource.imageInfo.imageHeight}`;
  }

  if (
    mediaSource.kind === "web-image" &&
    mediaSource.imageInfo?.imageWidth &&
    mediaSource.imageInfo?.imageHeight
  ) {
    return `${mediaSource.imageInfo.imageWidth} / ${mediaSource.imageInfo.imageHeight}`;
  }

  return undefined;
}

function SparklePlaceholder() {
  return (
    <svg aria-hidden="true" className="placeholder-sparkle" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L13.8 8.2L19 10L13.8 11.8L12 17L10.2 11.8L5 10L10.2 8.2L12 3Z" fill="currentColor" />
      <path d="M18.4 3.8L19 5.4L20.6 6L19 6.6L18.4 8.2L17.8 6.6L16.2 6L17.8 5.4L18.4 3.8Z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const [settings, setSettings] = useState<StoredSettings>(defaultSettings);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [historyItems, setHistoryItems] = useState<PromptHistoryItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>(
    createAnalysisState(null, "idle", "Prompt result will appear here.", DEFAULT_TARGET_MODEL)
  );
  const [mediaSource, setMediaSource] = useState<MediaSource>({ kind: "none" });
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState<"empty" | "loading" | "text" | "error">("empty");
  const [resultText, setResultText] = useState("Prompt result will appear here after analysis.");
  const [panelView, setPanelView] = useState<PanelView>("main");
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSamplingInfo, setShowSamplingInfo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lastSavedHistoryKeyRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const hasApiKey = settings.geminiApiKey.trim().length > 0;
  const hasMedia = mediaSource.kind !== "none";
  const isAnalyzing =
    isAnalyzingLocal ||
    analysisState.phase === "detecting" ||
    analysisState.phase === "extracting" ||
    analysisState.phase === "analyzing";
  const canAnalyze = hasMedia && !isAnalyzing;
  const showCopy = resultMode === "text" && resultText.trim().length > 0;
  const showGenerateVideo = showCopy && analysisState.mediaType === "video";
  const showGenerateImage = showCopy && analysisState.mediaType === "image";

  useEffect(() => {
    void (async () => {
      const [nextSettings, nextHistory] = await Promise.all([getSettings(), getPromptHistory()]);
      setSettings(nextSettings);
      setApiKeyInput(nextSettings.geminiApiKey);
      setHistoryItems(nextHistory);

      const context = (await chrome.runtime.sendMessage({
        type: "VIDEO2PROMPT_GET_PANEL_CONTEXT"
      } satisfies RuntimeMessage)) as PanelContextResponse;

      setActiveTabId(context.activeTabId);
      if (context.state) {
        syncFromBackgroundState(context.state);
      } else {
        resetPromptResult();
      }
    })();

    const handleMessage = (message: RuntimeMessage) => {
      if (message.type === "VIDEO2PROMPT_ANALYSIS_STATE_UPDATED") {
        syncFromBackgroundState(message.state);
        if (message.state.tabId) {
          setActiveTabId(message.state.tabId);
        }
        return;
      }

      if (message.type === "VIDEO2PROMPT_FOCUS_API_KEY") {
        setPanelView("settings");
        setMenuOpen(false);
      }
    };

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") {
        return;
      }

      if (changes["video2prompt:settings"]) {
        const next = changes["video2prompt:settings"].newValue as Partial<StoredSettings> | undefined;
        const merged = { ...defaultSettings, ...(next ?? {}) };
        setSettings(merged);
        setApiKeyInput(merged.geminiApiKey);
      }

      if (changes["video2prompt:history"]) {
        setHistoryItems((changes["video2prompt:history"].newValue as PromptHistoryItem[] | undefined) ?? []);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(handleStorageChanged);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChanged);
      if (localObjectUrlRef.current) {
        URL.revokeObjectURL(localObjectUrlRef.current);
        localObjectUrlRef.current = null;
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  function showToast(message: string) {
    setStatusMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setStatusMessage(null), 1800);
  }

  async function persistHistoryRecord(options: {
    sourceType: AnalysisSourceType;
    mediaType: AnalysisMediaType;
    sourceUrl?: string;
    pageTitle?: string;
    thumbnailDataUrl?: string;
    promptText: string;
    videoSummary?: string;
    dedupeKey: string;
  }) {
    if (!options.promptText.trim() || lastSavedHistoryKeyRef.current === options.dedupeKey) {
      return;
    }

    lastSavedHistoryKeyRef.current = options.dedupeKey;
    const nextHistory = await savePromptHistoryItem({
      id: createHistoryId(),
      createdAt: Date.now(),
      sourceType: options.sourceType,
      mediaType: options.mediaType,
      sourceUrl: options.sourceUrl,
      pageTitle: options.pageTitle,
      thumbnailDataUrl: await compressThumbnailDataUrl(options.thumbnailDataUrl),
      promptText: options.promptText,
      videoSummary: options.videoSummary
    });
    setHistoryItems(nextHistory);
  }

  function syncFromBackgroundState(state: AnalysisState) {
    setAnalysisState(state);
    setPanelView("main");

    if (state.mediaType === "image" && (state.previewFrameUrl || state.imageInfo)) {
      setMediaSource({
        kind: "web-image",
        previewUrl: state.previewFrameUrl,
        imageInfo: state.imageInfo
      });
    }

    if (state.phase === "generated" && state.generatedPrompt) {
      setResultMode("text");
      setResultText(state.generatedPrompt);
      void persistHistoryRecord({
        sourceType: state.sourceType ?? "web",
        mediaType: state.mediaType ?? "image",
        sourceUrl: state.imageInfo?.pageUrl ?? state.imageInfo?.src,
        pageTitle: state.imageInfo?.pageTitle,
        thumbnailDataUrl: state.previewFrameUrl,
        promptText: state.generatedPrompt,
        videoSummary: state.mediaType === "video" ? state.videoSummary : state.imageSummary,
        dedupeKey: `${state.sourceType ?? "web"}:${state.mediaType ?? "image"}:${state.updatedAt}:${state.generatedPrompt}`
      });
      return;
    }

    if (state.phase === "error") {
      setResultMode("error");
      setResultText(state.errorMessage ?? state.statusText);
      return;
    }

    if (state.phase === "detecting" || state.phase === "extracting" || state.phase === "analyzing") {
      setResultMode("loading");
      setResultText("Analyzing media...\nThis may take a few moments.");
      return;
    }

    if (state.phase === "ready" && !state.generatedPrompt) {
      resetPromptResult();
    }
  }

  function resetPromptResult() {
    setResultMode("empty");
    setResultText("Prompt result will appear here after analysis.");
    setCopyLabel("Copy");
  }

  async function handleAnalyze() {
    if (!hasApiKey) {
      setPanelView("settings");
      setMenuOpen(false);
      return;
    }

    if (!hasMedia || isAnalyzing) {
      return;
    }

    resetPromptResult();
    setResultMode("loading");
    setResultText("Analyzing media...\nThis may take a few moments.");
    setPanelView("main");

    if (mediaSource.kind === "web-image") {
      const response = (await chrome.runtime.sendMessage({
        type: "VIDEO2PROMPT_START_ANALYSIS",
        tabId: activeTabId ?? undefined,
        imageUrl: mediaSource.imageInfo?.src,
        triggeredFrom: "sidePanel"
      } satisfies RuntimeMessage)) as StartAnalysisResponse;

      if (response?.state) {
        syncFromBackgroundState(response.state);
      }
      return;
    }

    if (mediaSource.kind === "local-video") {
      setIsAnalyzingLocal(true);

      try {
        const video = await createVideoElement(mediaSource.objectUrl);
        const videoInfo = buildLocalVideoInfo(video, mediaSource.fileName);
        const frames = await extractFrames(video, {
          mode: settings.frameSamplingMode
        });
        const result = await analyzeVideoFramesWithGemini({
          apiKey: settings.geminiApiKey,
          targetModel: settings.targetModel,
          frames,
          videoInfo
        });

        const generatedState = createAnalysisState(activeTabId, "generated", "Prompt generated.", settings.targetModel, {
          mediaType: "video",
          sourceType: "local",
          videoInfo,
          previewFrameUrl: frames[0]?.dataUrl,
          keyframeCount: frames.length,
          ...result
        });

        setMediaSource({
          kind: "local-video",
          objectUrl: mediaSource.objectUrl,
          fileName: mediaSource.fileName,
          videoInfo
        });
        setAnalysisState(generatedState);
        setResultMode("text");
        setResultText(result.generatedPrompt);

        await persistHistoryRecord({
          sourceType: "local",
          mediaType: "video",
          sourceUrl: videoInfo.src,
          pageTitle: videoInfo.pageTitle,
          thumbnailDataUrl: frames[0]?.dataUrl,
          promptText: result.generatedPrompt,
          videoSummary: result.videoSummary,
          dedupeKey: `local:${generatedState.updatedAt}:${result.generatedPrompt}`
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not extract frames from this video. The website may block video access.";
        setAnalysisState(
          createAnalysisState(activeTabId, "error", message, settings.targetModel, {
            errorMessage: message
          })
        );
        setResultMode("error");
        setResultText(message);
      } finally {
        setIsAnalyzingLocal(false);
      }
    }

    if (mediaSource.kind === "local-image") {
      setIsAnalyzingLocal(true);

      try {
        const [image, imageDataUrl] = await Promise.all([
          createImageElement(mediaSource.objectUrl),
          readFileAsDataUrl(mediaSource.file)
        ]);
        const imageInfo = buildLocalImageInfo(image, mediaSource.fileName);
        const result = await analyzeImageWithGemini({
          apiKey: settings.geminiApiKey,
          targetModel: settings.targetModel,
          imageDataUrl,
          imageInfo
        });

        const generatedState = createAnalysisState(activeTabId, "generated", "Prompt generated.", settings.targetModel, {
          mediaType: "image",
          sourceType: "local",
          imageInfo,
          previewFrameUrl: imageDataUrl,
          ...result
        });

        setMediaSource({
          kind: "local-image",
          objectUrl: mediaSource.objectUrl,
          fileName: mediaSource.fileName,
          file: mediaSource.file,
          imageInfo
        });
        setAnalysisState(generatedState);
        setResultMode("text");
        setResultText(result.generatedPrompt);

        await persistHistoryRecord({
          sourceType: "local",
          mediaType: "image",
          sourceUrl: imageInfo.src,
          pageTitle: imageInfo.pageTitle,
          thumbnailDataUrl: imageDataUrl,
          promptText: result.generatedPrompt,
          videoSummary: result.imageSummary,
          dedupeKey: `local:image:${generatedState.updatedAt}:${result.generatedPrompt}`
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not analyze this image. Please try another local image file.";
        setAnalysisState(
          createAnalysisState(activeTabId, "error", message, settings.targetModel, {
            mediaType: "image",
            sourceType: "local",
            errorMessage: message
          })
        );
        setResultMode("error");
        setResultText(message);
      } finally {
        setIsAnalyzingLocal(false);
      }
    }
  }

  async function handleClear() {
    if (isAnalyzing) {
      return;
    }

    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
      localObjectUrlRef.current = null;
    }

    if (activeTabId) {
      await chrome.runtime.sendMessage({
        type: "VIDEO2PROMPT_CLEAR_ACTIVE_ANALYSIS",
        tabId: activeTabId
      } satisfies RuntimeMessage);
    }

    setMediaSource({ kind: "none" });
    setAnalysisState(createAnalysisState(activeTabId, "idle", "Prompt result will appear here.", settings.targetModel));
    resetPromptResult();
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleOpenSettingsView() {
    setPanelView("settings");
    setMenuOpen(false);
  }

  async function handleLocalUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    localObjectUrlRef.current = objectUrl;

    if (file.type.startsWith("image/")) {
      const image = await createImageElement(objectUrl);
      const imageInfo = buildLocalImageInfo(image, file.name);
      setMediaSource({ kind: "local-image", objectUrl, fileName: file.name, file, imageInfo });
      setAnalysisState(
        createAnalysisState(activeTabId, "ready", "Local image ready.", settings.targetModel, {
          mediaType: "image",
          sourceType: "local",
          imageInfo,
          previewFrameUrl: objectUrl
        })
      );
    } else {
      const video = await createVideoElement(objectUrl);
      const videoInfo = buildLocalVideoInfo(video, file.name);
      setMediaSource({ kind: "local-video", objectUrl, fileName: file.name, videoInfo });
      setAnalysisState(
        createAnalysisState(activeTabId, "ready", "Local video ready.", settings.targetModel, {
          mediaType: "video",
          sourceType: "local",
          videoInfo
        })
      );
    }

    setPanelView("main");
    resetPromptResult();
    event.target.value = "";
  }

  async function handleCopy() {
    if (!showCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(resultText);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    } catch {
      setCopyLabel("Copy");
    }
  }

  async function handleCopyHistory(item: PromptHistoryItem) {
    try {
      await navigator.clipboard.writeText(item.promptText);
      setCopiedHistoryId(item.id);
      window.setTimeout(() => {
        setCopiedHistoryId((current) => (current === item.id ? null : current));
      }, 1600);
    } catch {
      setCopiedHistoryId(null);
    }
  }

  async function handleDeleteHistory(item: PromptHistoryItem) {
    const nextHistory = await deletePromptHistoryItem(item.id);
    setHistoryItems(nextHistory);
  }

  async function handleGenerateVideo() {
    await chrome.tabs.create({
      url: "https://seegen.ai/?utm_source=extension"
    });
  }

  async function handleSaveApiKey() {
    const nextSettings = await saveApiKey(apiKeyInput);
    setSettings(nextSettings);
    setApiKeyInput(nextSettings.geminiApiKey);
    showToast("API key saved.");
  }

  async function handleDeleteSavedApiKey() {
    const confirmed = window.confirm(
      "Delete saved API key?\n\nYou will need to add a new key before analyzing media again."
    );
    if (!confirmed) {
      return;
    }
    const nextSettings = await deleteApiKey();
    setSettings(nextSettings);
    setApiKeyInput("");
    showToast("API key deleted.");
  }

  async function handleFrameSamplingModeChange(mode: FrameSamplingMode) {
    if (settings.frameSamplingMode === mode) {
      return;
    }

    const nextSettings = await saveFrameSamplingMode(mode);
    setSettings(nextSettings);
    showToast("Frame sampling mode saved.");
  }

  const currentMediaPreview = useMemo(() => {
    if (mediaSource.kind === "web-image" && mediaSource.previewUrl) {
      return <img src={mediaSource.previewUrl} alt="Current web image preview" className="video-preview-media" />;
    }

    if (mediaSource.kind === "local-video") {
      return (
        <video
          className="video-preview-media"
          src={mediaSource.objectUrl}
          muted
          playsInline
          preload="metadata"
        />
      );
    }

    if (mediaSource.kind === "local-image") {
      return <img src={mediaSource.objectUrl} alt="Current local image preview" className="video-preview-media" />;
    }

    if (mediaSource.kind === "web-image") {
      return <div className="video-preview-placeholder" />;
    }

    return null;
  }, [mediaSource]);

  const currentMediaAspectRatio = useMemo(
    () => getMediaAspectRatio(mediaSource),
    [mediaSource]
  );

  return (
    <main className="promptlab-shell">
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="video/*,image/jpeg,image/png,image/webp,image/gif"
        onChange={handleLocalUpload}
      />

      {panelView === "main" ? (
        <>
          <section className="promptlab-card header-card">
            <div className="header-top">
              <div className="brand-lockup">
                <img src="icons/icon48.png" alt="" className="brand-icon" />
                <h1 className="brand-wordmark">
                  <span className="brand-wordmark-primary">Prompt</span>
                  <span className="brand-wordmark-accent">Lab</span>
                </h1>
              </div>

              <div className="header-menu-wrap" ref={menuRef}>
                <button
                  className="menu-button"
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <MoreIcon />
                </button>

                {menuOpen ? (
                  <div className="header-dropdown-menu">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setPanelView("history");
                        setMenuOpen(false);
                      }}
                    >
                      <HistoryIcon />
                      <span>History</span>
                    </button>
                    <button className="dropdown-item" onClick={handleOpenSettingsView}>
                      <GearIcon />
                      <span>Settings</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <p>Turn videos and images into prompts.</p>
            <span className="header-glow" aria-hidden="true" />
          </section>

          <section className="promptlab-card">
            <div className="card-title">Current Media</div>

            {mediaSource.kind === "none" ? (
              <div className="upload-state">
                <button className="upload-trigger" onClick={handleUploadClick} aria-label="Upload local media">
                  <UploadIcon />
                </button>
                <strong>No media selected</strong>
                <p>Right-click a web image to analyze it, or upload a local image or video.</p>
              </div>
            ) : (
              <div
                className="video-preview-frame"
                style={
                  currentMediaAspectRatio
                    ? { aspectRatio: currentMediaAspectRatio }
                    : undefined
                }
              >
                {currentMediaPreview}
              </div>
            )}

            {mediaSource.kind !== "none" ? (
              <div className="button-row">
                <button
                  className={`primary-button ${isAnalyzing ? "primary-button-analyzing" : ""}`}
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                >
                  {isAnalyzing ? (
                    <>
                      <SpinnerIcon />
                      Analyzing
                    </>
                  ) : (
                    "Analyze"
                  )}
                </button>
                <button className="secondary-button" onClick={handleClear} disabled={isAnalyzing}>
                  Clear
                </button>
              </div>
            ) : null}
          </section>

          <section className="promptlab-card">
            <div className="result-header">
              <div className="card-title">Prompt Result</div>
              {showCopy ? (
                <button className="copy-button" onClick={handleCopy}>
                  {copyLabel}
                </button>
              ) : null}
            </div>

            <div className={`result-box result-box-${resultMode}`}>
              {resultMode === "loading" ? (
                <div className="loading-state">
                  <SpinnerIcon />
                  <strong>Analyzing media...</strong>
                  <p>This may take a few moments.</p>
                </div>
              ) : null}

              {resultMode === "empty" ? (
                <div className="result-placeholder">
                  <SparklePlaceholder />
                  <p>Prompt result will appear here after analysis.</p>
                </div>
              ) : null}

              {resultMode === "error" ? (
                <div className="result-error">
                  <p>{resultText}</p>
                </div>
              ) : null}

              {resultMode === "text" ? <div className="result-text-block">{resultText}</div> : null}
            </div>

            {showGenerateVideo ? (
              <button className="generate-video-button" onClick={handleGenerateVideo}>
                Generate Video
              </button>
            ) : null}

            {showGenerateImage ? (
              <button className="generate-video-button" onClick={handleGenerateVideo}>
                Generate Image
              </button>
            ) : null}
          </section>
        </>
      ) : null}

      {panelView === "history" ? (
        <section className="subview-screen history-screen">
          <span className="subview-screen-glow" aria-hidden="true" />
          <div className="subview-topbar">
            <div className="subview-title-row">
              <button className="back-button back-button-box" onClick={() => setPanelView("main")}>
                <BackIcon />
              </button>
              <h2 className="subview-title">History</h2>
            </div>
            <p className="subview-subtitle">Latest 10 prompts</p>
          </div>

          <section className="history-panel">
            {historyItems.length === 0 ? (
              <div className="history-empty-state history-empty-state-large">
                <strong>No history yet</strong>
                <p>Generated prompts will appear here after analysis.</p>
              </div>
            ) : (
              <div className="history-list history-list-large">
                {historyItems.map((item) => (
                  <article className="history-item history-item-large" key={item.id}>
                    <div className="history-content">
                      <div className="history-meta history-meta-large">
                        <span className="history-time">
                          <ClockIcon />
                          <span>{formatHistoryTime(item.createdAt)}</span>
                        </span>
                        <span className={`source-pill ${item.sourceType === "local" ? "source-pill-local" : "source-pill-web"}`}>
                          {item.sourceType === "local" ? <CloudUploadIcon /> : <GlobeIcon />}
                          {getHistorySourceLabel(item.sourceType, item.mediaType)}
                        </span>
                      </div>
                      <p className="prompt-preview prompt-preview-large">{item.promptText}</p>
                      <div className="history-item-divider" />
                      <div className="history-actions history-actions-wide">
                        <button className="history-action-button history-action-copy" onClick={() => void handleCopyHistory(item)}>
                          <CopyIcon />
                          <span>{copiedHistoryId === item.id ? "Copied" : "Copy"}</span>
                        </button>
                        <button className="history-action-button history-action-delete" onClick={() => void handleDeleteHistory(item)}>
                          <TrashIcon />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {panelView === "settings" ? (
        <section className="subview-screen settings-screen">
          <span className="subview-screen-glow" aria-hidden="true" />
          <div className="subview-topbar">
            <div className="subview-title-row">
              <button className="back-button back-button-box" onClick={() => setPanelView("main")}>
                <BackIcon />
              </button>
              <h2 className="subview-title">Settings</h2>
            </div>
          </div>

          <section className="settings-stack">
            <article className="promptlab-card settings-hero-card">
              <div className="settings-hero-top">
                <div className="settings-icon-box">
                  <KeyIcon />
                </div>
                <h3 className="settings-hero-title">Gemini API Key</h3>
              </div>

              <div className="settings-hero-divider" />

              <label className="settings-field settings-field-large">
                <span>API Key</span>
                <div className="settings-input-wrap">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder="AIza..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="input-icon-button"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    onClick={() => setShowApiKey((current) => !current)}
                  >
                    <EyeIcon />
                  </button>
                </div>
              </label>

              <div className="settings-actions-column settings-actions-column-large">
                <button className="primary-button full-width-button settings-primary-cta" onClick={() => void handleSaveApiKey()}>
                  <ShieldIcon />
                  <span>{hasApiKey ? "Update API Key" : "Save API Key"}</span>
                </button>

                {hasApiKey ? (
                  <button className="settings-delete-button" onClick={() => void handleDeleteSavedApiKey()}>
                    <TrashIcon />
                    <span>Delete API Key</span>
                  </button>
                ) : null}
              </div>

              <div className="settings-hero-divider settings-hero-divider-soft" />

              <section className="settings-mode-section">
                <div className="settings-mode-header">
                  <div className="settings-mode-title-wrap">
                    <h3 className="settings-mode-title">Frame Sampling Mode</h3>
                    <button
                      type="button"
                      className="settings-info-button"
                      aria-label="Frame sampling mode help"
                      aria-expanded={showSamplingInfo}
                      onClick={() => setShowSamplingInfo((current) => !current)}
                    >
                      <InfoIcon />
                    </button>
                  </div>

                  {showSamplingInfo ? (
                    <div className="settings-info-popover" role="note">
                      <p>Local video frame counts:</p>
                      <p><strong>Fast:</strong> fixed 5 frames.</p>
                      <p><strong>Standard:</strong> 10s or less: 6, 10-30s: 10, 30-60s: 14, over 60s: 16.</p>
                      <p><strong>Detailed:</strong> 10s or less: 10, 10-30s: 16, 30-60s: 24, over 60s: 32.</p>
                    </div>
                  ) : null}
                </div>

                <p className="settings-copy settings-copy-compact">
                  This setting only affects local video analysis. Image analysis does not use frame sampling.
                </p>

                <div className="settings-mode-options" role="radiogroup" aria-label="Frame sampling mode">
                  {(Object.keys(FRAME_MODE_COPY) as FrameSamplingMode[]).map((mode) => {
                    const isSelected = settings.frameSamplingMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`settings-mode-chip ${isSelected ? "is-selected" : ""}`}
                        onClick={() => void handleFrameSamplingModeChange(mode)}
                      >
                        <span className="settings-mode-chip-label">{FRAME_MODE_COPY[mode].label}</span>
                        <span className="settings-mode-chip-description">{FRAME_MODE_COPY[mode].description}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </article>

            <article className="promptlab-card settings-privacy-card">
              <div className="settings-privacy-row">
                <div className="settings-icon-box settings-icon-box-soft">
                  <ShieldIcon />
                </div>
                <div className="settings-privacy-copy">
                  <h3 className="settings-privacy-title">Privacy</h3>
                  <p className="settings-copy">Your API key is stored locally in this browser.</p>
                </div>
              </div>
            </article>
          </section>
        </section>
      ) : null}

      {statusMessage ? <div className="toast-modern">{statusMessage}</div> : null}
    </main>
  );
}
