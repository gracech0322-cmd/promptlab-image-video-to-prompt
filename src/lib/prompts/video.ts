import {
  TARGET_MODELS,
  type DetectedVideoInfo,
  type TargetModelId
} from "../types";

function targetModelLabel(targetModel: TargetModelId): string {
  return TARGET_MODELS.find((model) => model.id === targetModel)?.label ?? targetModel;
}

function inferAspectRatio(videoInfo?: DetectedVideoInfo): string {
  if (!videoInfo?.videoWidth || !videoInfo.videoHeight) {
    return "the source video's aspect ratio";
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
        openingLine: {
          type: "string"
        },
        mainSubject: {
          type: "string"
        },
        scene: {
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
              description: {
                type: "string"
              }
            },
            required: ["time", "description"]
          }
        },
        camera: {
          type: "string"
        },
        motion: {
          type: "string"
        },
        lighting: {
          type: "string"
        },
        style: {
          type: "string"
        },
        qualityConstraints: {
          type: "string"
        }
      },
      required: [
        "openingLine",
        "mainSubject",
        "scene",
        "timeline",
        "camera",
        "motion",
        "lighting",
        "style",
        "qualityConstraints"
      ]
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
      ? `${Math.max(1, Math.round(videoInfo.duration))}`
      : "8 to 10";

  return `You are an expert AI video prompt engineer.

Analyze the provided video keyframes and infer the full video structure.

Generate a structured English AI video prompt optimized for the selected target model: ${modelLabel}.

Video metadata:
- Page title: ${videoInfo?.pageTitle ?? "Unknown"}
- Page URL: ${videoInfo?.pageUrl ?? "Unknown"}
- Source duration hint: ${durationHint} seconds
- Source aspect ratio hint: ${inferAspectRatio(videoInfo)}

Focus on:
- main subject
- subject appearance
- scene and environment
- motion and action
- camera movement
- transition
- lighting
- color grading
- visual style
- timeline structure
- quality constraints

Return valid JSON only.

Do not include Markdown.
Do not include code fences.
Do not include explanations outside the JSON.

The JSON must follow this exact structure:

{
  "videoSummary": "A short English summary of the video, including subject, action, scene, mood, and visual style.",
  "targetModel": "${modelLabel}",
  "generatedPrompt": {
    "openingLine": "Create a ${durationHint}-second cinematic video in ${inferAspectRatio(videoInfo)}.",
    "mainSubject": "Describe the main subject, appearance, outfit, posture, emotion, and identity consistency details.",
    "scene": "Describe the location, time of day, background, environment, atmosphere, props, and spatial layout.",
    "timeline": [
      {
        "time": "0-3s",
        "description": "Describe the opening shot, subject action, camera movement, and visual focus."
      },
      {
        "time": "3-6s",
        "description": "Describe the main motion, interaction, transition, and camera movement."
      },
      {
        "time": "6-10s",
        "description": "Describe the final action, ending composition, emotional beat, and camera movement."
      }
    ],
    "camera": "Describe shot type, framing, angle, camera movement, speed, lens feeling, and transition style.",
    "motion": "Describe subject movement, object movement, background movement, rhythm, and continuity.",
    "lighting": "Describe light source, color temperature, contrast, shadows, highlights, and mood.",
    "style": "Describe visual style, genre, color grading, realism level, texture, and production quality.",
    "qualityConstraints": "stable subject, consistent character, smooth motion, natural body movement, natural facial details, no flicker, no deformation, no distorted hands, no extra limbs, no sudden identity change."
  }
}

Keep every value in English and make the prompt directly usable in AI video generation systems.`;
}
