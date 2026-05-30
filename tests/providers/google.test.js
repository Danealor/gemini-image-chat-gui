// tests/providers/google.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildContents, buildConfig, parseResponse } = require('../../providers/google');

test('buildContents puts the prompt first, then one inlineData part per image', () => {
  const parts = buildContents('a cat', [
    { buffer: Buffer.from('abc'), mimeType: 'image/png' },
    { buffer: Buffer.from('def'), mimeType: 'image/jpeg' },
  ]);
  assert.deepStrictEqual(parts[0], { text: 'a cat' });
  assert.strictEqual(parts[1].inlineData.mimeType, 'image/png');
  assert.strictEqual(parts[1].inlineData.data, Buffer.from('abc').toString('base64'));
  assert.strictEqual(parts[2].inlineData.mimeType, 'image/jpeg');
});

test('buildContents with no images is just the prompt', () => {
  const parts = buildContents('hello', []);
  assert.deepStrictEqual(parts, [{ text: 'hello' }]);
});

test('buildConfig always requests TEXT and IMAGE modalities', () => {
  const cfg = buildConfig({});
  assert.deepStrictEqual(cfg.responseModalities, ['TEXT', 'IMAGE']);
  assert.strictEqual(cfg.imageConfig, undefined);
});

test('buildConfig maps resolution and aspectRatio into imageConfig', () => {
  const cfg = buildConfig({ resolution: '2K', aspectRatio: '16:9' });
  assert.strictEqual(cfg.imageConfig.imageSize, '2K');
  assert.strictEqual(cfg.imageConfig.aspectRatio, '16:9');
});

test('parseResponse extracts inlineData parts as data URLs, ignoring text parts', () => {
  const response = {
    candidates: [{ content: { parts: [
      { text: 'here you go' },
      { inlineData: { mimeType: 'image/png', data: 'QUJD' } },
    ] } }],
  };
  assert.deepStrictEqual(parseResponse(response), { images: ['data:image/png;base64,QUJD'] });
});

test('parseResponse returns empty list when no image parts', () => {
  assert.deepStrictEqual(parseResponse({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }), { images: [] });
  assert.deepStrictEqual(parseResponse({}), { images: [] });
});
