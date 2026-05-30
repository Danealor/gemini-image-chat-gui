// providers/index.js
// Registry-aware dispatch layer. Filters models by configured API keys and routes
// generate() calls to the correct provider adapter.

const google = require('./google');
const openai = require('./openai');
const { MODELS, DEFAULT_MODEL, getModel, migrateModelId } = require('./models');

const ADAPTERS = { google, openai };
const PROVIDER_ENV = { google: 'GOOGLE_API_KEY', openai: 'OPENAI_API_KEY' };

function isProviderConfigured(provider) {
  return !!process.env[PROVIDER_ENV[provider]];
}

function getConfiguredProviders() {
  return Object.fromEntries(Object.keys(PROVIDER_ENV).map(p => [p, isProviderConfigured(p)]));
}

// Models whose provider has an API key configured (the only ones the UI should offer).
function getModels() {
  return MODELS.filter(m => isProviderConfigured(m.provider));
}

// Dispatch a single generation call to the right adapter.
async function generate(modelId, { prompt, inputImages, options }) {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  if (!isProviderConfigured(model.provider)) {
    throw new Error(`Provider ${model.provider} not configured (set ${PROVIDER_ENV[model.provider]})`);
  }
  return ADAPTERS[model.provider].generate({ model: model.id, prompt, inputImages, options });
}

module.exports = {
  getModels, getConfiguredProviders, isProviderConfigured, generate,
  getModel, migrateModelId, DEFAULT_MODEL,
};
