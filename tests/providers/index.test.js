// tests/providers/index.test.js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// Module is cached by require(); env changes between tests are still visible because
// the provider functions read process.env on every call (no caching of key state).
const providers = require('../../providers');

beforeEach(() => {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

test('getConfiguredProviders reflects which keys are set', () => {
  process.env.GOOGLE_API_KEY = 'g';
  assert.deepStrictEqual(providers.getConfiguredProviders(), { google: true, openai: false });
});

test('getModels returns only models whose provider key is configured', () => {
  process.env.OPENAI_API_KEY = 'o';
  const ids = providers.getModels().map(m => m.id);
  assert.deepStrictEqual(ids, ['gpt-image-2']);
});

test('getModels returns all models when both keys set', () => {
  process.env.GOOGLE_API_KEY = 'g';
  process.env.OPENAI_API_KEY = 'o';
  assert.strictEqual(providers.getModels().length, 4);
});

test('generate throws for unknown model', async () => {
  await assert.rejects(() => providers.generate('nope', { prompt: 'x', inputImages: [], options: {} }), /Unknown model/);
});

test('generate throws when the model provider is not configured', async () => {
  await assert.rejects(
    () => providers.generate('gpt-image-2', { prompt: 'x', inputImages: [], options: {} }),
    /not configured/
  );
});
