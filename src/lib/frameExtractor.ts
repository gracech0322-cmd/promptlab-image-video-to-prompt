import type {
  DetectedVideoInfo,
  ExtractedFrame,
  FrameExtractionOptions,
  FrameSamplingMode
} from "./types";

const METADATA_WAIT_TIMEOUT_MS = 2_000;

function waitForEvent(
  target: EventTarget,
  eventName: string,
  timeoutMs = 8_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      window.clearTimeout(timeoutId);
    };

    const onEvent = () => {
      cleanup();
      resolve();
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);

    target.addEventListener(eventName, onEvent, { once: true });
  });
}

async function ensureReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await waitForEvent(video, "loadeddata");
}

export function waitForMetadata(
  video: HTMLVideoElement,
  timeoutMs: number
): Promise<boolean> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let timeoutId = 0;

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("durationchange", onMetadata);
      window.clearTimeout(timeoutId);
    };

    const onMetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        cleanup();
        resolve(true);
      }
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(Number.isFinite(video.duration) && video.duration > 0);
    }, timeoutMs);

    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("durationchange", onMetadata);
  });
}

export function getFrameCount(
  duration: number,
  mode: FrameSamplingMode
): number {
  if (mode === "fast") {
    return 5;
  }

  // Standard stays the default because it balances analysis quality and runtime cost for most local videos.
  if (mode === "standard") {
    if (duration <= 10) {
      return 6;
    }
    if (duration <= 30) {
      return 10;
    }
    if (duration <= 60) {
      return 14;
    }
    return 16;
  }

  if (duration <= 10) {
    return 10;
  }
  if (duration <= 30) {
    return 16;
  }
  if (duration <= 60) {
    return 24;
  }
  return 32;
}

export function getExportSettings(
  mode: FrameSamplingMode
): { maxSide: number; quality: number } {
  if (mode === "fast") {
    return { maxSide: 768, quality: 0.8 };
  }

  return { maxSide: 1024, quality: 0.85 };
}

export function generateTimestamps(
  duration: number,
  frameCount: number
): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || frameCount <= 0) {
    return [];
  }

  if (frameCount === 1) {
    return [0];
  }

  // We stop at 95% instead of 100% to avoid black frames or failing seeks near the very end.
  const lastTimestamp = duration * 0.95;
  const step = lastTimestamp / (frameCount - 1);

  return Array.from({ length: frameCount }, (_, index) =>
    index === frameCount - 1 ? lastTimestamp : step * index
  );
}

export function dedupeTimestamps(timestamps: number[]): number[] {
  const deduped: number[] = [];

  for (const timestamp of timestamps) {
    const rounded = Math.max(0, Number(timestamp.toFixed(3)));
    if (!deduped.some((value) => Math.abs(value - rounded) < 0.05)) {
      deduped.push(rounded);
    }
  }

  return deduped;
}

function buildFallbackTimestamps(video: HTMLVideoElement): number[] {
  const currentTime = video.currentTime || 0;
  return dedupeTimestamps(
    [-3, -1.5, 0, 1.5, 3].map((offset) => Math.max(0, currentTime + offset))
  );
}

function scaleDimensions(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxSide) {
    return { width, height };
  }

  const ratio = maxSide / longestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function drawVideoFrame(
  video: HTMLVideoElement,
  exportSettings: { maxSide: number; quality: number }
): string {
  const { width, height } = scaleDimensions(
    video.videoWidth || 1280,
    video.videoHeight || 720,
    exportSettings.maxSide
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare a canvas context.");
  }

  context.drawImage(video, 0, 0, width, height);

  try {
    return canvas.toDataURL("image/jpeg", exportSettings.quality);
  } catch (error) {
    throw new Error(
      error instanceof Error && /tainted|cross-origin/i.test(error.message)
        ? "FRAME_EXTRACTION_BLOCKED"
        : "FRAME_EXTRACTION_FAILED"
    );
  }
}

async function captureAtTimestamp(
  video: HTMLVideoElement,
  timestamp: number,
  exportSettings: { maxSide: number; quality: number }
): Promise<ExtractedFrame> {
  if (Math.abs(video.currentTime - timestamp) > 0.05) {
    try {
      video.currentTime = timestamp;
    } catch {
      throw new Error("FRAME_EXTRACTION_UNSEEKABLE");
    }

    try {
      await waitForEvent(video, "seeked");
    } catch {
      throw new Error("FRAME_EXTRACTION_UNSEEKABLE");
    }
  }

  await ensureReady(video);

  return {
    timestamp,
    dataUrl: drawVideoFrame(video, exportSettings)
  };
}

export function getVideoInfo(video: HTMLVideoElement): DetectedVideoInfo {
  return {
    found: true,
    duration: Number.isFinite(video.duration) ? video.duration : undefined,
    currentTime: video.currentTime,
    videoWidth: video.videoWidth || undefined,
    videoHeight: video.videoHeight || undefined,
    src: video.currentSrc || video.src || undefined,
    pageTitle: document.title,
    pageUrl: location.href
  };
}

export async function extractFrames(
  video: HTMLVideoElement,
  options: FrameExtractionOptions = {}
): Promise<ExtractedFrame[]> {
  const mode = options.mode ?? "standard";
  const exportSettings = getExportSettings(mode);
  const originalTime = video.currentTime || 0;
  const wasPaused = video.paused;
  const frames: ExtractedFrame[] = [];
  let sawBlockedFrame = false;
  let sawSeekFailure = false;

  try {
    await ensureReady(video);
    video.pause();

    const hasDuration = await waitForMetadata(video, METADATA_WAIT_TIMEOUT_MS);
    const timestamps =
      hasDuration && Number.isFinite(video.duration) && video.duration > 0
        ? generateTimestamps(video.duration, getFrameCount(video.duration, mode))
        : buildFallbackTimestamps(video);

    for (const timestamp of timestamps) {
      try {
        frames.push(await captureAtTimestamp(video, timestamp, exportSettings));
      } catch (error) {
        if (!(error instanceof Error)) {
          continue;
        }

        if (error.message === "FRAME_EXTRACTION_BLOCKED") {
          sawBlockedFrame = true;
          break;
        }

        if (error.message === "FRAME_EXTRACTION_UNSEEKABLE") {
          sawSeekFailure = true;
        }
      }
    }

    if (frames.length > 0) {
      return frames;
    }

    if (sawBlockedFrame) {
      throw new Error("FRAME_EXTRACTION_BLOCKED");
    }

    if (sawSeekFailure) {
      throw new Error("This video cannot be seeked for frame extraction.");
    }

    throw new Error(
      "Could not extract frames from this video. The website may block video access due to CORS or streaming restrictions."
    );
  } catch (error) {
    if (error instanceof Error && error.message === "FRAME_EXTRACTION_BLOCKED") {
      throw new Error(
        "This video cannot be analyzed directly because the website blocks frame extraction. Please try another local video file."
      );
    }

    throw new Error(
      error instanceof Error
        ? error.message
        : "Could not extract frames from this video. Please try another local video file."
    );
  } finally {
    try {
      if (Math.abs(video.currentTime - originalTime) > 0.05) {
        video.currentTime = originalTime;
      }
    } catch {
      // Ignore restore failures and still try to restore playback state.
    }

    if (wasPaused) {
      video.pause();
    } else {
      try {
        await video.play();
      } catch {
        // Playback restore can fail due to autoplay restrictions.
      }
    }
  }
}
