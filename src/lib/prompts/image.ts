import {
  TARGET_MODELS,
  type DetectedImageInfo,
  type TargetModelId
} from "../types";

function targetModelLabel(targetModel: TargetModelId): string {
  return TARGET_MODELS.find((model) => model.id === targetModel)?.label ?? targetModel;
}

function inferImageAspectRatio(imageInfo?: DetectedImageInfo): string {
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

export const GEMINI_IMAGE_RESPONSE_SCHEMA = {
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
} as const;

export function buildGeminiImageInstruction(
  targetModel: TargetModelId,
  imageInfo?: DetectedImageInfo
): string {
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
