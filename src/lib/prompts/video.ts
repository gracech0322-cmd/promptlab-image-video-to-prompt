import {
  TARGET_MODELS,
  type DetectedVideoInfo,
  type TargetModelId
} from "../types";

function targetModelLabel(targetModel: TargetModelId): string {
  return TARGET_MODELS.find((model) => model.id === targetModel)?.label ?? targetModel;
}

function inferAspectRatio(videoInfo?: DetectedVideoInfo): string | null {
  if (!videoInfo?.videoWidth || !videoInfo.videoHeight) {
    return null;
  }

  const ratio = videoInfo.videoWidth / videoInfo.videoHeight;
  if (ratio > 1.7) {
    return "16:9";
  }
  if (ratio < 0.8) {
    return "9:16";
  }
  return "1:1 or 4:5";
}

export function getTargetModelLabel(targetModel: TargetModelId): string {
  return targetModelLabel(targetModel);
}

export const GEMINI_VIDEO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    videoSummary: {
      type: "string"
    },
    targetModel: {
      type: "string"
    },
    generatedPrompt: {
      type: "object",
      properties: {
        globalStyle: {
          type: "string"
        },
        timeline: {
          type: "array",
          items: {
            type: "object",
            properties: {
              time: {
                type: "string"
              },
              subject: {
                type: "string"
              },
              action: {
                type: "string"
              },
              setting: {
                type: "string"
              },
              camera: {
                type: "string"
              },
              mood: {
                type: "string"
              },
              sound: {
                type: "string"
              }
            },
            required: ["time", "subject", "action", "setting", "camera", "mood", "sound"]
          }
        },
        consistencyConstraints: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },
      required: ["globalStyle", "timeline", "consistencyConstraints"]
    }
  },
  required: ["videoSummary", "targetModel", "generatedPrompt"]
} as const;

export function buildGeminiVideoInstruction(
  targetModel: TargetModelId,
  videoInfo?: DetectedVideoInfo
): string {
  const modelLabel = targetModelLabel(targetModel);
  const durationHint =
    typeof videoInfo?.duration === "number" && Number.isFinite(videoInfo.duration)
      ? `${Math.max(1, Math.round(videoInfo.duration))} seconds`
      : "the source video length";
  const aspectRatioHint = inferAspectRatio(videoInfo);

  return `You are an expert AI video prompt engineer.

Analyze the provided video keyframes and infer the full video structure.

Generate one structured English AI video prompt optimized for the selected target model: ${modelLabel}.

Video metadata:
- Page title: ${videoInfo?.pageTitle ?? "Unknown"}
- Page URL: ${videoInfo?.pageUrl ?? "Unknown"}
- Source duration hint: ${durationHint}
- Source aspect ratio hint: ${aspectRatioHint ?? "unknown"}

Output goals:
- The final result must still be one single usable prompt.
- Inside that prompt, organize the content into three sections:
  1. Global Style
  2. Shot-by-Shot Timeline
  3. Consistency & Quality Constraints
- Keep the writing natural and production-ready.
- Do not invent major story events that are not supported by the video.

Global Style requirements:
- Describe the global visual style shared across the full video.
- Include visual style, image quality, lighting tone, color mood, and overall atmosphere.
- Include aspect ratio only if it is reasonably clear from the video.
- If the lighting changes over time, say that it changes naturally across the timeline.
- Write this as one natural English paragraph.

Shot-by-Shot Timeline requirements:
- Split the video into 2 to 4 time segments for short videos, or more only when the content clearly needs it.
- Use approximate time ranges when exact timing is unclear.
- Each segment must contain:
  - Subject
  - Action
  - Setting
  - Camera
  - Mood
  - Sound
- Subject should stay clear. If it is the same subject, you may say "same subject" only when clarity is still preserved.
- Action must be specific and visible.
- Setting must describe the visible environment.
- Camera must use one main camera move only.
- Mood must be visually concrete through expression, body language, movement rhythm, and visible emotion.
- Sound must describe ambient sound, music, sound effects, or environmental audio. Do not invent dialogue unless clearly visible.
- If little sound is implied, use: "subtle ambient sound only, no dialogue."

Consistency & Quality Constraints requirements:
- Return clear English bullet-point constraints.
- Cover subject consistency, natural motion, anti-deformation, stable scene, stable lighting, clean image quality, camera movement control, and sound consistency.
- Include constraints equivalent to these ideas:
  - Keep the same subject consistent across all shots, including face, clothing, body shape, hairstyle, accessories, and proportions.
  - Motion should be smooth, physically natural, and free from jitter, twitching, sticky limbs, or sudden speed jumps.
  - Avoid face distortion, extra fingers, folded limbs, object intersections, warped objects, or broken anatomy.
  - Keep backgrounds stable without flickering, sudden changes, perspective collapse, or texture crawling.
  - Maintain stable exposure and shadow direction consistent with the global lighting tone.
  - Keep the image clean, sharp, and free from noise, mosaic artifacts, edge aliasing, or compression artifacts.
  - Use only one main camera movement per time segment.
  - Keep sound consistent with the scene.

Return valid JSON only.
Do not include Markdown.
Do not include code fences.
Do not include explanations outside the JSON.

The JSON must follow this exact structure:

{
  "videoSummary": "A short English summary of the video, including subject, action, scene, mood, and visual style.",
  "targetModel": "${modelLabel}",
  "generatedPrompt": {
    "globalStyle": "One natural English paragraph describing the shared global style of the whole video.",
    "timeline": [
      {
        "time": "0-3s",
        "subject": "Describe the subject in this time segment.",
        "action": "Describe the visible action in this time segment.",
        "setting": "Describe the visible setting in this time segment.",
        "camera": "Describe one main camera movement or camera setup only.",
        "mood": "Describe visible emotion through facial expression, posture, movement rhythm, and body language.",
        "sound": "Describe ambient sound, music, and sound effects, or say subtle ambient sound only, no dialogue."
      }
    ],
    "consistencyConstraints": [
      "One bullet-point style quality or consistency constraint.",
      "Another bullet-point style quality or consistency constraint."
    ]
  }
}

Keep every value in English and make the prompt directly usable in AI video generation systems.`;
}
