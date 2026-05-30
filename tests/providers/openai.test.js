// tests/providers/openai.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildParams, parseResponse, isEdit } = require('../../providers/openai');

test('buildParams includes model and prompt and maps provided options', () => {
  const p = buildParams('gpt-image-2', 'a dog', { size: '1024x1024', quality: 'high', background: 'transparent' });
  assert.strictEqual(p.model, 'gpt-image-2');
  assert.strictEqual(p.prompt, 'a dog');
  assert.strictEqual(p.size, '1024x1024');
  assert.strictEqual(p.quality, 'high');
  assert.strictEqual(p.background, 'transparent');
});

test('buildParams omits options that were not provided', () => {
  const p = buildParams('gpt-image-2', 'x', {});
  assert.strictEqual('size' in p, false);
  assert.strictEqual('quality' in p, false);
  assert.strictEqual('background' in p, false);
});

test('buildParams drops "auto" sentinel values (let the API default)', () => {
  const p = buildParams('gpt-image-2', 'x', { size: 'auto', quality: 'auto' });
  assert.strictEqual('size' in p, false);
  assert.strictEqual('quality' in p, false);
});

test('isEdit is true only when there are input images', () => {
  assert.strictEqual(isEdit([]), false);
  assert.strictEqual(isEdit([{ buffer: Buffer.from('x'), mimeType: 'image/png' }]), true);
});

test('parseResponse turns b64_json entries into PNG data URLs', () => {
  const res = { data: [{ b64_json: 'QUJD' }, { b64_json: 'REVG' }] };
  assert.deepStrictEqual(parseResponse(res), { images: ['data:image/png;base64,QUJD', 'data:image/png;base64,REVG'] });
});

test('parseResponse returns empty list when no data', () => {
  assert.deepStrictEqual(parseResponse({}), { images: [] });
});
