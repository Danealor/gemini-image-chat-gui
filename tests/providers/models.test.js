// tests/providers/models.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { MODELS, DEFAULT_MODEL, getModel, migrateModelId } = require('../../providers/models');

test('registry contains the four expected models', () => {
  const ids = MODELS.map(m => m.id).sort();
  assert.deepStrictEqual(ids, [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image',
    'gemini-3.1-flash-image',
    'gpt-image-2',
  ]);
});

test('every model has provider and capabilities', () => {
  for (const m of MODELS) {
    assert.ok(m.provider, `${m.id} missing provider`);
    assert.ok(m.capabilities, `${m.id} missing capabilities`);
    assert.strictEqual(typeof m.capabilities.edit, 'boolean');
    assert.strictEqual(typeof m.capabilities.maxOutputs, 'number');
  }
});

test('getModel returns the model or undefined', () => {
  assert.strictEqual(getModel('gpt-image-2').provider, 'openai');
  assert.strictEqual(getModel('nope'), undefined);
});

test('migrateModelId maps legacy AIML ids to native', () => {
  assert.strictEqual(migrateModelId('google/nano-banana-pro-edit'), 'gemini-3-pro-image');
  assert.strictEqual(migrateModelId('google/gemini-3-pro-image-preview-edit'), 'gemini-3-pro-image');
});

test('migrateModelId passes through known native ids', () => {
  assert.strictEqual(migrateModelId('gpt-image-2'), 'gpt-image-2');
});

test('migrateModelId falls back to default for unknown ids', () => {
  assert.strictEqual(migrateModelId('totally-unknown'), DEFAULT_MODEL);
  assert.strictEqual(migrateModelId(undefined), DEFAULT_MODEL);
});
