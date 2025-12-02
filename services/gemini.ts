
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

  // Sanitize API Key
  const sanitizedApiKey = apiKey?.trim();
  if (!sanitizedApiKey) {
    throw new Error("API Key is required");
  }

  // Determine API Base URL
  const apiBase = baseUrl?.trim() || "https://generativelanguage.googleapis.com";
  // Use v1beta for the latest models like gemini-3-pro-image-preview
  // API Key is passed via header instead of URL parameter for better security
  const url = `${apiBase}/v1beta/models/${MODEL_NAME}:generateContent`;

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

  const payload = {
    contents: [
      {
        parts: parts
      }
    ],
    generationConfig: {
      imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: resolution
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": sanitizedApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {
        // Fallback to raw text if JSON parse fails
        errorMessage += ` - ${errorText.substring(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Extract image
    // Structure: candidates[0].content.parts[].inlineData.data
    if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
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
