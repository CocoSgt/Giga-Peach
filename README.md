# Giga Peach 🍑

**Best Suite for Nano Banana (Gemini 3 Pro Image Preview)**

Giga Peach is a professional-grade, multi-modal AI image generation tool designed to unlock the full potential of Google's **gemini-3-pro-image-preview** model. It offers a powerful, local-first experience for creative professionals.

## Features

- **Batch Generation**: Generate up to 8 images at once.
- **Multi-Ratio Support**: Select multiple aspect ratios (e.g., 16:9, 1:1, 9:16) to generate simultaneously in a single run.
- **Style Presets**: Create, edit, and manage custom style presets with embedded prompts and reference images.
- **Multi-Modal Input**: Use text prompts, reference images (up to 6), or both.
- **Style Transfer**: Upload style reference images to guide the aesthetic of your generations.
- **Local Privacy**: All data (API keys, history, presets) is stored locally in your browser (IndexedDB/LocalStorage).
- **BYOK (Bring Your Own Key)**: Use your own Google API Key.

## Getting Started

1.  Clone the repository.
2.  Open `index.html` in a modern browser (or serve via a simple HTTP server).
3.  Click the **Connect Key** button in the top right.
4.  Enter your Google Gemini API Key. (Get one [here](https://aistudio.google.com/app/apikey)).
5.  Start generating!

## Technologies

- **Frontend**: React 19, Tailwind CSS, Lucide Icons
- **AI SDK**: Google GenAI SDK
- **Storage**: IndexedDB (Dexie-like implementation)

## Credits

Created by **[cocosgt](https://x.com/CocoSgt_twt)**.
