import { analyzeImageWithGemini } from "../lib/geminiClient";
import { fetchImageAsDataUrl } from "../lib/imageUtils";
import {
  clearAnalysisState,
  createAnalysisState,
  getAnalysisState,
  getSettings,
  saveAnalysisState
} from "../lib/storage";
import {
  DEFAULT_TARGET_MODEL,
  type AnalysisPhase,
  type AnalysisState,
  type DetectedImageInfo,
  type RuntimeMessage
} from "../lib/types";

const CONTEXT_MENU_ID = "analyze-image-to-prompt";

async function configureSidePanelBehavior(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}

async function createContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Analyze Image to Prompt",
    contexts: ["image"]
  });
}

function toSerializableState(state: AnalysisState): AnalysisState {
  return {
    ...state,
    updatedAt: Date.now()
  };
}

async function publishState(state: AnalysisState): Promise<void> {
  const serializableState = toSerializableState(state);
  await saveAnalysisState(serializableState);
  try {
    await chrome.runtime.sendMessage({
      type: "VIDEO2PROMPT_ANALYSIS_STATE_UPDATED",
      state: serializableState
    } satisfies RuntimeMessage);
  } catch {
    // Ignore when the side panel is closed and no receiver is listening.
  }
}

async function setState(
  tabId: number,
  phase: AnalysisPhase,
  statusText: string,
  targetModel: AnalysisState["targetModel"],
  extras: Partial<AnalysisState> = {}
): Promise<AnalysisState> {
  const state = createAnalysisState(tabId, phase, statusText, targetModel, extras);
  await publishState(state);
  return state;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}

function openSidePanelForTab(tabId: number): void {
  chrome.sidePanel.open({ tabId }).catch((error) => {
    console.error("PromptLab failed to open side panel.", error);
  });
}

function buildWebImageInfo(
  imageUrl: string,
  tab?: chrome.tabs.Tab
): DetectedImageInfo {
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
}: {
  tabId?: number;
  imageUrl?: string;
}): Promise<{ ok: boolean; state: AnalysisState }> {
  const activeTab = tabId
    ? await chrome.tabs.get(tabId).catch(() => null)
    : await getActiveTab();
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
      } satisfies RuntimeMessage);
    } catch {
      // Ignore if the side panel is not open yet.
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
        errorMessage:
          "No image was found. Please right-click directly on a standard webpage image and try again."
      }
    );
    return { ok: false, state };
  }

  const imageInfo = buildWebImageInfo(imageUrl, activeTab ?? undefined);

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
    let geminiResult: Awaited<ReturnType<typeof analyzeImageWithGemini>>;

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
    const message =
      error instanceof Error
        ? error.message
        : "Could not load this image for analysis.";

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

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
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
