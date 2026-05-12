import {
  DEFAULT_FRAME_SAMPLING_MODE,
  DEFAULT_TARGET_MODEL,
  TARGET_MODELS,
  type AnalysisPhase,
  type AnalysisState,
  type FrameSamplingMode,
  type PromptHistoryItem,
  type StoredSettings,
  type TargetModelId
} from "./types";

const SETTINGS_KEY = "video2prompt:settings";
const ANALYSIS_KEY_PREFIX = "video2prompt:analysis:";
const HISTORY_KEY = "video2prompt:history";

export const defaultSettings: StoredSettings = {
  geminiApiKey: "",
  targetModel: DEFAULT_TARGET_MODEL,
  frameSamplingMode: DEFAULT_FRAME_SAMPLING_MODE
};

function normalizeTargetModel(value: unknown): TargetModelId {
  if (TARGET_MODELS.some((model) => model.id === value)) {
    return value as TargetModelId;
  }

  if (value === "happyhorse-1.0") {
    return "generic-ai-video";
  }

  return DEFAULT_TARGET_MODEL;
}

function normalizeFrameSamplingMode(value: unknown): FrameSamplingMode {
  if (value === "fast" || value === "standard" || value === "detailed") {
    return value;
  }

  return DEFAULT_FRAME_SAMPLING_MODE;
}

export function createAnalysisState(
  tabId: number | null,
  phase: AnalysisPhase,
  statusText: string,
  targetModel: TargetModelId,
  extras: Partial<AnalysisState> = {}
): AnalysisState {
  return {
    tabId,
    phase,
    statusText,
    targetModel,
    updatedAt: Date.now(),
    ...extras
  };
}

export async function getSettings(): Promise<StoredSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const merged = {
    ...defaultSettings,
    ...(stored[SETTINGS_KEY] as Partial<StoredSettings> | undefined)
  };

  return {
    geminiApiKey: merged.geminiApiKey ?? "",
    targetModel: normalizeTargetModel(merged.targetModel),
    frameSamplingMode: normalizeFrameSamplingMode(merged.frameSamplingMode)
  };
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: settings
  });
}

export async function saveApiKey(geminiApiKey: string): Promise<StoredSettings> {
  const current = await getSettings();
  const next = { ...current, geminiApiKey: geminiApiKey.trim() };
  await saveSettings(next);
  return next;
}

export async function deleteApiKey(): Promise<StoredSettings> {
  const current = await getSettings();
  const next = { ...current, geminiApiKey: "" };
  await saveSettings(next);
  return next;
}

export async function saveTargetModel(
  targetModel: TargetModelId
): Promise<StoredSettings> {
  const current = await getSettings();
  const next = { ...current, targetModel };
  await saveSettings(next);
  return next;
}

export async function saveFrameSamplingMode(
  frameSamplingMode: FrameSamplingMode
): Promise<StoredSettings> {
  const current = await getSettings();
  const next = { ...current, frameSamplingMode };
  await saveSettings(next);
  return next;
}

export function analysisStorageKey(tabId: number): string {
  return `${ANALYSIS_KEY_PREFIX}${tabId}`;
}

export async function getAnalysisState(
  tabId: number
): Promise<AnalysisState | null> {
  const key = analysisStorageKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return (stored[key] as AnalysisState | undefined) ?? null;
}

export async function saveAnalysisState(state: AnalysisState): Promise<void> {
  if (state.tabId == null) {
    return;
  }

  await chrome.storage.local.set({
    [analysisStorageKey(state.tabId)]: state
  });
}

export async function clearAnalysisState(tabId: number): Promise<void> {
  await chrome.storage.local.remove(analysisStorageKey(tabId));
}

export async function getPromptHistory(): Promise<PromptHistoryItem[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = stored[HISTORY_KEY];
  if (!Array.isArray(history)) {
    return [];
  }

  return history.map((item) => {
    const normalized = item as Partial<PromptHistoryItem>;
    return {
      id: normalized.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: normalized.createdAt ?? Date.now(),
      sourceType:
        normalized.sourceType === "web"
          ? "web"
          : normalized.sourceType === "enhancer"
            ? "enhancer"
            : "local",
      mediaType:
        normalized.mediaType ??
        (normalized.sourceType === "web" ? "image" : normalized.sourceType === "enhancer" ? "video" : "video"),
      sourceUrl: normalized.sourceUrl,
      pageTitle: normalized.pageTitle,
      thumbnailDataUrl: normalized.thumbnailDataUrl,
      promptText: normalized.promptText ?? "",
      videoSummary: normalized.videoSummary
    };
  });
}

async function savePromptHistory(
  history: PromptHistoryItem[]
): Promise<PromptHistoryItem[]> {
  const next = history.slice(0, 20);
  await chrome.storage.local.set({
    [HISTORY_KEY]: next
  });
  return next;
}

export async function savePromptHistoryItem(
  item: PromptHistoryItem
): Promise<PromptHistoryItem[]> {
  const current = await getPromptHistory();
  return savePromptHistory([item, ...current]);
}

export async function deletePromptHistoryItem(
  id: string
): Promise<PromptHistoryItem[]> {
  const current = await getPromptHistory();
  return savePromptHistory(current.filter((item) => item.id !== id));
}
