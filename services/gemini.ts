import { GoogleGenAI } from "@google/genai";
import { MODEL_NAME } from "../constants";
import { Resolution, AspectRatio } from "../types";

interface GenerateImageOptions {
  prompt: string;
  referenceImages?: string[]; // base64 array
  aspectRatio: AspectRatio;
  resolution: Resolution;
  apiKey: string;
  baseUrl?: string;
}

export const generateSingleImage = async (options: GenerateImageOptions): Promise<string> => {
  const { prompt, referenceImages, aspectRatio, resolution, apiKey, baseUrl } = options;

  if (!apiKey) {
    throw new Error("API Key is required");
  }

  // Initialize with user provided key and optional base URL
  // We treat baseUrl as a constructor option if provided, defaulting to standard behavior if not
  const clientOptions: any = { apiKey };
  if (baseUrl) {
    clientOptions.baseUrl = baseUrl;
  }
  
  const ai = new GoogleGenAI(clientOptions);
  
  // Always use the Pro model as requested
  const modelToUse = MODEL_NAME;
  
  const parts: any[] = [];
  
  // Add reference images if present
  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach(img => {
        // Extract base64 data and mime type
        // Format usually: data:image/png;base64,....
        const matches = img.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
            parts.push({
                inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                }
            });
        }
    });
  }

  // Add text prompt
  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: {
        parts: parts
      },
      config: {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: resolution
        }
      }
    });

    // Extract image
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    throw new Error("No image data found in response");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};