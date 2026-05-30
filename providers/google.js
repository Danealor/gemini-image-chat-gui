// providers/google.js
// Google Gemini image adapter. Uses the official @google/genai SDK.
// Pure builders (buildContents/buildConfig/parseResponse) are unit-tested without network;
// generate() wires them to the SDK.

const { GoogleGenAI } = require('@google/genai');

let client;
// Lazily create the SDK client. Invariant: only called after dotenv has loaded the API
// key at startup, and only via generate() after isProviderConfigured() has passed — so
// the key is always present here. Cached for the process lifetime.
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  return client;
}

// Build the `contents` array: prompt text first, then one inlineData part per input image.
function buildContents(prompt, inputImages) {
  const parts = [{ text: prompt }];
  for (const img of inputImages) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.buffer.toString('base64') } });
  }
  return parts;
}

// Build the request `config`. Always asks for TEXT+IMAGE; adds imageConfig when sizing options exist.
function buildConfig(options) {
  const config = { responseModalities: ['TEXT', 'IMAGE'] };
  const imageConfig = {};
  if (options.resolution) imageConfig.imageSize = options.resolution;
  if (options.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
  if (Object.keys(imageConfig).length > 0) config.imageConfig = imageConfig;
  return config;
}

// Normalize a generateContent response into { images: [dataUrl, ...] }.
function parseResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const images = [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      images.push(`data:${mime};base64,${part.inlineData.data}`);
    }
  }
  return { images };
}

// Generate (or edit) one batch of images for a single call.
async function generate({ model, prompt, inputImages, options }) {
  const response = await getClient().models.generateContent({
    model,
    contents: buildContents(prompt, inputImages),
    config: buildConfig(options),
  });
  return parseResponse(response);
}

module.exports = { generate, buildContents, buildConfig, parseResponse };
