// providers/openai.js
// OpenAI GPT Image adapter. Uses the official openai SDK.
// Text-to-image -> images.generate; with input images -> images.edit (multi-image).
// Pure helpers (buildParams/parseResponse/isEdit) are unit-tested without network.

const OpenAI = require('openai');
const { toFile } = require('openai');

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Build the shared request params. 'auto' sentinels are dropped so the API picks its default.
function buildParams(model, prompt, options) {
  const params = { model, prompt };
  if (options.size && options.size !== 'auto') params.size = options.size;
  if (options.quality && options.quality !== 'auto') params.quality = options.quality;
  if (options.background && options.background !== 'auto') params.background = options.background;
  return params;
}

function isEdit(inputImages) {
  return inputImages.length > 0;
}

// Normalize an images response into { images: [dataUrl, ...] }.
function parseResponse(response) {
  const images = (response?.data || []).map(d => `data:image/png;base64,${d.b64_json}`);
  return { images };
}

// Generate (or edit) one image for a single call.
async function generate({ model, prompt, inputImages, options }) {
  const params = buildParams(model, prompt, options);
  let response;
  if (isEdit(inputImages)) {
    const files = await Promise.all(
      inputImages.map((img, i) => toFile(img.buffer, `image_${i}.png`, { type: img.mimeType }))
    );
    response = await getClient().images.edit({ ...params, image: files });
  } else {
    response = await getClient().images.generate(params);
  }
  return parseResponse(response);
}

module.exports = { generate, buildParams, parseResponse, isEdit };
