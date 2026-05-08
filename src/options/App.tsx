import { type ChangeEvent, useEffect, useState } from "react";
import {
  FRAME_SAMPLING_MODES,
  type FrameSamplingMode,
  type StoredSettings
} from "../lib/types";
import {
  defaultSettings,
  saveApiKey,
  saveFrameSamplingMode
} from "../lib/storage";

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return apiKey;
  }

  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

const FRAME_MODE_LABELS: Record<FrameSamplingMode, string> = {
  fast: "Fast",
  standard: "Standard",
  detailed: "Detailed"
};

export function App() {
  const [settings, setSettings] = useState<StoredSettings>(defaultSettings);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.local.get("video2prompt:settings");
      const nextSettings = {
        ...defaultSettings,
        ...(stored["video2prompt:settings"] as Partial<StoredSettings> | undefined)
      };
      setSettings(nextSettings);
      setApiKeyInput(nextSettings.geminiApiKey);
    })();
  }, []);

  async function handleSaveApiKey() {
    const nextSettings = await saveApiKey(apiKeyInput);
    setSettings(nextSettings);
    setStatusMessage("Gemini API key saved.");
    setTimeout(() => setStatusMessage(null), 1800);
  }

  async function handleClose() {
    try {
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab?.id) {
        await chrome.tabs.remove(currentTab.id);
        return;
      }
    } catch {
      // Fall back to the browser close behavior below.
    }

    window.close();
  }

  async function handleFrameSamplingModeChange(
    event: ChangeEvent<HTMLSelectElement>
  ) {
    const mode = event.target.value as FrameSamplingMode;
    const nextSettings = await saveFrameSamplingMode(mode);
    setSettings(nextSettings);
    setStatusMessage("Frame sampling mode saved.");
    setTimeout(() => setStatusMessage(null), 1800);
  }

  return (
    <main className="promptlab-shell options-shell">
      <section className="promptlab-card header-card options-header-card">
        <div className="header-top">
          <div className="brand-lockup options-header-copy">
            <img src="icons/icon48.png" alt="" className="brand-icon" />
            <div>
              <h1 className="brand-wordmark">
                <span className="brand-wordmark-primary">Prompt</span>
                <span className="brand-wordmark-accent">Lab</span>
              </h1>
              <p className="options-header-subtitle">Gemini settings</p>
            </div>
          </div>
          <button className="settings-pill" onClick={handleClose}>
            Close
          </button>
        </div>
        <p>Manage the Gemini API key PromptLab uses to analyze local videos and images from the side panel.</p>
        <div className="settings-status-row">
          <span className={`settings-status-pill ${settings.geminiApiKey ? "is-ready" : "is-required"}`}>
            {settings.geminiApiKey ? "API key saved" : "Setup required"}
          </span>
          <span className="settings-status-copy">
            Used for web image analysis plus local image and local video analysis.
          </span>
        </div>
        <span className="header-glow" aria-hidden="true" />
      </section>

      <section className="promptlab-card settings-panel-card">
        <div className="settings-section-head">
          <div>
            <div className="card-title">Gemini API Key</div>
            <p className="settings-copy">
              Stored locally in your browser and sent directly to Gemini. PromptLab does not use its own backend.
            </p>
          </div>
          {settings.geminiApiKey ? (
            <span className="settings-saved-chip">Saved: {maskApiKey(settings.geminiApiKey)}</span>
          ) : null}
        </div>
        <label className="settings-field">
          <span>API Key</span>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
            placeholder="AIza..."
            autoComplete="off"
          />
        </label>
        <div className="settings-actions">
          <button className="primary-button" onClick={handleSaveApiKey}>
            {settings.geminiApiKey ? "Update API Key" : "Save API Key"}
          </button>
        </div>
        <div className="settings-divider" />
        <label className="settings-field">
          <span>Frame Sampling Mode</span>
          <select
            value={settings.frameSamplingMode}
            onChange={handleFrameSamplingModeChange}
            className="settings-select"
            title="Fast: faster and lighter. Standard: recommended default. Detailed: more frames for complex local videos."
          >
            {FRAME_SAMPLING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {FRAME_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <p className="settings-copy">
          Fast is quicker, Standard is recommended, and Detailed captures more frames for complex local videos. Image analysis does not use frame sampling.
        </p>
        <div className="settings-divider" />
        <div className="settings-mini-card">
          <div className="settings-mini-title">Privacy</div>
          <p className="settings-copy">
            Local video frames and selected images are sent directly from your browser to Gemini for analysis.
          </p>
          <p className="settings-copy">
            Only analyze media you are comfortable sending to Gemini.
          </p>
        </div>
      </section>

      {statusMessage ? <div className="toast-modern">{statusMessage}</div> : null}
    </main>
  );
}
