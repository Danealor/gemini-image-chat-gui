// providers/models.js
// Single source of truth for selectable image models and their capabilities.
// Consumed by the server (dispatch/validation) and the frontend (dynamic UI).

const MODELS = [
  {
    id: 'gemini-3-pro-image',
    label: 'Gemini 3 Pro Image (Nano Banana Pro)',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14, resolutions: ['1K', '2K', '4K'], maxOutputs: 4 },
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image (Nano Banana)',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14, resolutions: ['1K', '2K'], maxOutputs: 4 },
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Nano Banana 2',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14, resolutions: ['512', '1K', '2K', '4K'], maxOutputs: 4 },
  },
  {
    id: 'gpt-image-2',
    label: 'OpenAI Images 2.0',
    provider: 'openai',
    capabilities: {
      edit: true, multiImageInput: true, maxInputImages: 10,
      sizes: ['auto', '1024x1024', '1536x1024', '1024x1536', '2048x2048', '3840x2160', '2160x3840'],
      qualities: ['auto', 'low', 'medium', 'high'],
      maxOutputs: 4,
    },
  },
];

const DEFAULT_MODEL = 'gemini-3-pro-image';

// Legacy AIML model strings stored in old chats -> nearest native model.
const LEGACY_MODEL_MAP = {
  'google/nano-banana-pro-edit': 'gemini-3-pro-image',
  'google/gemini-3-pro-image-preview-edit': 'gemini-3-pro-image',
};

function getModel(id) {
  return MODELS.find(m => m.id === id);
}

// Returns a valid current model id for any stored value (native, legacy, or unknown).
function migrateModelId(id) {
  if (id && getModel(id)) return id;
  if (id && LEGACY_MODEL_MAP[id]) return LEGACY_MODEL_MAP[id];
  return DEFAULT_MODEL;
}

module.exports = { MODELS, DEFAULT_MODEL, getModel, migrateModelId, LEGACY_MODEL_MAP };
