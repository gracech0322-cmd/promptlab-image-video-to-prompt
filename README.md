# PromptLab: Image & Video to Prompt

PromptLab is a free, open-source Chrome extension for turning local videos, web images, and local images into reusable AI prompts with Gemini.

Current V1 product scope:

- Local Video to Prompt
- Web Image to Prompt
- Local Image to Prompt

The current version does not support online video analysis.

## Features

- Upload a local video and generate a prompt from extracted keyframes
- Choose local video frame sampling mode: `Fast`, `Standard`, or `Detailed`
- Right-click a standard web image and analyze it in the side panel
- Upload a local image and analyze it directly
- Copy the generated prompt
- Store prompt history locally in the browser
- Bring your own Gemini API key
- No backend server required

## Supported Inputs

### Local video

- Local uploaded video files
- Duration-based frame extraction
- Adaptive sampling for `Standard` and `Detailed`

### Web image

- Standard webpage `<img>` images
- Triggered from the browser context menu

### Local image

- `jpg`
- `jpeg`
- `png`
- `webp`
- `gif` may work depending on browser decoding behavior

## Privacy

Your Gemini API key is stored locally in your browser.

PromptLab does not send your API key to any custom backend.

Selected images and extracted local video frames are sent directly from your browser to Gemini for analysis.

Only analyze media you are comfortable sending to Gemini.

## Limitations

- Online video analysis is not supported in the current version
- Web image analysis currently targets standard `<img>` content only
- Complex image sources such as CSS background images, canvas-rendered visuals, and special blob/image pipelines are out of scope for V1

## Development

### Install dependencies

```bash
npm install
```

### Build the extension

```bash
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select the `dist` folder

## Test

### Local video

1. Open the side panel
2. Upload a local video
3. Choose `Fast`, `Standard`, or `Detailed` in Settings if needed
4. Click `Analyze`

### Web image

1. Open a page with a normal `<img>`
2. Right-click the image
3. Click `Analyze Image to Prompt`

### Local image

1. Open the side panel
2. Upload a local image
3. Click `Analyze`
