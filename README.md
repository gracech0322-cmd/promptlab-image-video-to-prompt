# PromptLab: Image & Video to Prompt

Turn local videos and web/local images into ready-to-use AI prompts.

PromptLab is a Chrome extension for AI creators, prompt learners, visual reference study, and short video prompt reverse engineering. It helps you turn local video files, web images, and local image files into clean prompts you can copy and use.

## Features

### Local Video to Prompt

- Upload a local video file
- Extract key frames automatically
- Generate one clean Final Result prompt
- Designed for short creative videos, AI videos, ads, reels, and cinematic clips
- Default frame sampling mode: Standard
- Supports Fast / Standard / Detailed frame sampling modes

### Image to Prompt

- Right-click a web image and generate a prompt
- Upload a local image and generate a prompt
- Uses a dedicated image prompt template
- Outputs one clean Final Result prompt
- Optimized for image generation and visual recreation

### Prompt History

- Automatically saves recent generation records
- Keeps up to 10 recent records

### Simple Output

- One unified result: Final Result
- No long analysis report
- No unnecessary labels like "Image Prompt:" or "Analysis:"
- Copy and use directly

## What PromptLab Does

PromptLab can analyze:

- Local video files
- Web images
- Local image files

PromptLab does not currently support full online video analysis from platforms like Instagram, TikTok, X, Facebook, or YouTube.

For video analysis, please upload a local video file.

## Installation

1. Download or clone this repository.
2. Open Chrome.
3. Go to `chrome://extensions/`.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the extension folder.
7. Open Settings and add your Gemini API Key.

## Gemini API Key

PromptLab uses your own Gemini API Key.

You can get a Gemini API Key from Google AI Studio:

https://aistudio.google.com/

After you install the extension, open Settings and paste your Gemini API Key.

## API Key Privacy

Your Gemini API Key is stored locally in your browser extension storage.

The project developer cannot see, collect, or access your API Key.

Images, video frames, and prompts may be sent to Gemini for analysis based on your Gemini API usage.

If you are worried about API usage or accidental exposure, you can set a daily API usage limit in Google AI Studio or Gemini settings.

## Settings

### Gemini API Key

Required. Used to send image or video frame analysis requests to Gemini.

### Frame Sampling Mode

This setting only applies to local video analysis.

Default mode: Standard

Available modes:

- Fast
- Standard
- Detailed

Fast:

- Fewer frames
- Faster analysis
- Best for quick prompt generation

Standard:

- Default recommended mode
- Balanced speed and prompt quality
- Best for most local videos

Detailed:

- More frames
- Better for complex motion, transitions, ads, and AI showcase videos
- Slower and may use more API resources

Image analysis does not use frame sampling settings.

## Video Frame Sampling

Fast:

- 5 frames
- 0%, 25%, 50%, 75%, 95%

Standard:

- duration <= 10s: 6 frames
- 10s < duration <= 30s: 10 frames
- 30s < duration <= 60s: 14 frames
- duration > 60s: 16 frames

Detailed:

- duration <= 10s: 10 frames
- 10s < duration <= 30s: 16 frames
- 30s < duration <= 60s: 24 frames
- duration > 60s: 32 frames

PromptLab samples from 0% to 95% of the video duration. It avoids 100% to reduce the chance of black frames or seek errors.

## Image Prompt Logic

Image analysis uses its own image-oriented prompt template.

It focuses on:

- Subject
- Scene
- Composition
- Style
- Lighting
- Color palette
- Mood
- Texture
- Material
- Perspective
- Visual quality
- Image generation keywords

## Video Prompt Logic

Video analysis uses a video-oriented prompt template.

It focuses on:

- Subject
- Scene
- Action
- Camera language
- Motion
- Pacing
- Visual continuity
- Cinematic structure
- AI video generation style

## Current Limitations

PromptLab does not support:

- Instagram video extraction
- TikTok video extraction
- X / Twitter video extraction
- Facebook video extraction
- YouTube video extraction
- DRM or protected video extraction
- m3u8 video downloading
- Streaming video parsing

For best video results, upload a local video file.

## Privacy

PromptLab uses your own Gemini API Key.

Your API Key is stored locally in browser extension storage.

The developer cannot access your API Key.

Depending on your Gemini API usage, images, video frames, and prompts may be sent to Gemini for analysis.

Do not analyze private, sensitive, or copyrighted content unless you have permission.

You can set a daily API usage limit in Google AI Studio.

## Roadmap

- [x] Local video to prompt
- [x] Web image to prompt
- [x] Local image to prompt
- [x] Fast / Standard / Detailed video frame sampling
- [x] Prompt history, up to 10 records

Planned:

- [ ] Better image source fallback
- [ ] Prompt style presets
- [ ] Batch image analysis
- [ ] Direct video URL import
- [ ] Optional online video visible segment capture

## License

This project is licensed under the MIT License.

The PromptLab name, logo, and branding assets are not included in the MIT License and may not be used without permission.
