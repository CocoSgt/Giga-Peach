import { StylePreset } from './types';

// Using the prompt's mapping: "Nano Banana Pro" -> gemini-3-pro-image-preview
export const MODEL_NAME = 'gemini-3-pro-image-preview';

export const DEFAULT_PRESETS: StylePreset[] = [
  {
    id: 'none',
    name: 'Default',
    description: '',
    // No icon for default
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Soft watercolor style, natural blending effects, warm tones, artistic strokes',
    icon: '🎨',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon lights, rainy night city, high-tech low-life aesthetic, futuristic',
    icon: '🌃',
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Exquisite lines, bright colors, Japanese anime character design style',
    icon: '🌸',
  },
  {
    id: 'photoreal',
    name: 'Photorealistic',
    description: 'High-definition photography texture, natural lighting, realistic details, 8k',
    icon: '📷',
  },
  {
    id: 'minimal',
    name: 'Minimalist',
    description: 'Simple geometric shapes, flat design, clean and neat, vector art',
    icon: '⬜',
  },
  {
    id: '3d-render',
    name: '3D Render',
    description: 'C4D texture, soft lighting, 3D modeling, octane render',
    icon: '🎲',
  },
];

export const ASPECT_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
];