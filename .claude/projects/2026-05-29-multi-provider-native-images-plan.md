# Multi-Provider Native Image Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single AIMLAPI image path with native per-provider adapters (Google Gemini via `@google/genai`, OpenAI GPT Image via `openai`), selectable from a capability-driven UI.

**Architecture:** A thin `providers/` adapter layer exposes a uniform `generate()` contract. A model registry with capability flags is the single source of truth, consumed by both the server (validation/dispatch) and the frontend (dynamic dropdown + controls). `server.js` becomes provider-agnostic: it gathers input images into buffers, fans out N calls, and dispatches by model. Pure request-building / response-parsing functions in each adapter are unit-tested directly (no network); end-to-end flow is covered by Playwright against a stub server.

**Tech Stack:** Node.js, Express, `@google/genai`, `openai`, `node:test` (built-in, no new test-runner dep), Playwright.

**Reference:** Design spec at `.claude/projects/2026-05-29-multi-provider-native-images-design.md`.

---

## File Structure

**Create:**
- `providers/models.js` — model registry, capabilities, legacy migration map, default model.
- `providers/google.js` — Gemini adapter (pure builders + `generate`).
- `providers/openai.js` — GPT Image adapter (pure builders + `generate`).
- `providers/index.js` — key-presence filtering, dispatch.
- `providers/CLAUDE.md` — documents the adapter layer.
- `public/models.js` — client-side registry fetch/cache + capability queries.
- `tests/providers/models.test.js`, `tests/providers/google.test.js`, `tests/providers/openai.test.js`, `tests/providers/index.test.js` — `node:test` unit tests.
- `tests/multi-model.spec.js` — Playwright integration test.
- `CLAUDE.md` — top-level project documentation.

**Modify:**
- `server.js` — refactor `/api/generate`, add `/api/models`, update `/api/health`.
- `tests/test-server.js` — add `/api/models`, mirror new generate response.
- `public/index.html` — dynamic model select, OpenAI size/quality controls, model.js script tag.
- `public/app.js` — load registry, capability-driven controls, send options, legacy migration on load.
- `package.json` — add `@google/genai`, `openai`; add `test:unit` script.
- `.env.example`, `README.md` — drop AIML, add native keys + SDKs.

---

# Phase A — Provider layer (no dependencies)

### Task A1: Model registry + legacy migration

**Files:**
- Create: `providers/models.js`
- Test: `tests/providers/models.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/providers/models.test.js`
Expected: FAIL — `Cannot find module '../../providers/models'`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/providers/models.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add providers/models.js tests/providers/models.test.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add provider model registry and legacy migration"
```

---

### Task A2: Add SDK dependencies + unit-test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies and script**

Run (installs and saves to `package.json`):
```bash
npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI install @google/genai openai
```

Then edit `package.json` `scripts` to add a unit-test script (keep existing scripts):
```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "test": "playwright test",
  "test:headed": "playwright test --headed",
  "test:unit": "node --test tests/providers/"
}
```

- [ ] **Step 2: Verify install + registry test still runs via script**

Run: `npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI run test:unit`
Expected: PASS (models.test.js passes; other provider tests added in later tasks).

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add package.json package-lock.json
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add @google/genai and openai SDKs and unit-test script"
```

---

### Task A3: Google adapter (pure builders + generate)

**Files:**
- Create: `providers/google.js`
- Test: `tests/providers/google.test.js`

**Note:** The `imageConfig` field name and `imageSize` value casing are the most likely points of SDK drift. After this task, Task A6 runs a real smoke test to confirm. The pure builders below are written so a correction is a one-line change.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/providers/google.test.js`
Expected: FAIL — `Cannot find module '../../providers/google'`.

- [ ] **Step 3: Write minimal implementation**

```js
// providers/google.js
// Google Gemini image adapter. Uses the official @google/genai SDK.
// Pure builders (buildContents/buildConfig/parseResponse) are unit-tested without network;
// generate() wires them to the SDK.

const { GoogleGenAI } = require('@google/genai');

let client;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/providers/google.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add providers/google.js tests/providers/google.test.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add Google Gemini image adapter"
```

---

### Task A4: OpenAI adapter (pure builders + generate)

**Files:**
- Create: `providers/openai.js`
- Test: `tests/providers/openai.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/providers/openai.test.js`
Expected: FAIL — `Cannot find module '../../providers/openai'`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/providers/openai.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add providers/openai.js tests/providers/openai.test.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add OpenAI GPT Image adapter"
```

---

### Task A5: Provider index (key filtering + dispatch)

**Files:**
- Create: `providers/index.js`
- Test: `tests/providers/index.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/providers/index.test.js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// Require fresh each test so env changes are read live (functions read process.env per call).
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/providers/index.test.js`
Expected: FAIL — `Cannot find module '../../providers'`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/providers/index.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole unit suite**

Run: `npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI run test:unit`
Expected: PASS (all provider tests).

- [ ] **Step 6: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add providers/index.js tests/providers/index.test.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add provider dispatch layer with key-based filtering"
```

---

### Task A6: Real smoke test to verify SDK field names

**Files:**
- Create: `scripts/smoke.js`

**Purpose:** Confirm the `@google/genai` `imageConfig`/`imageSize` field names and the `openai` response shape against the *installed* SDK with real keys. This is the build-time verification flagged in the spec. Requires real `GOOGLE_API_KEY` / `OPENAI_API_KEY` in `.env`.

- [ ] **Step 1: Write the smoke script**

```js
// scripts/smoke.js
// Manual end-to-end check against real provider APIs. Run with real keys in .env:
//   node scripts/smoke.js gemini-3-pro-image "a red apple on a table"
//   node scripts/smoke.js gpt-image-2 "a red apple on a table"
require('dotenv').config();
const fs = require('fs');
const providers = require('../providers');

async function main() {
  const model = process.argv[2] || 'gemini-3-pro-image';
  const prompt = process.argv[3] || 'a single red apple on a wooden table, studio lighting';
  console.log(`Smoke test: model=${model}`);
  const { images } = await providers.generate(model, { prompt, inputImages: [], options: { resolution: '1K', size: '1024x1024' } });
  console.log(`Returned ${images.length} image(s).`);
  if (images.length === 0) throw new Error('No images returned — check SDK field names / model id.');
  const b64 = images[0].split(',')[1];
  fs.writeFileSync('smoke-output.png', Buffer.from(b64, 'base64'));
  console.log('Wrote smoke-output.png');
}
main().catch(e => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run smoke test for a Gemini model (requires GOOGLE_API_KEY)**

Run: `node C:/Users/iambl/GitHub/AIMLAPIGUI/scripts/smoke.js gemini-3-pro-image`
Expected: "Returned 1 image(s)." and `smoke-output.png` written.
**If it fails with an empty result or 400:** the `imageConfig` field name or `imageSize` casing in `providers/google.js:buildConfig` is wrong for this SDK version. Check the installed SDK's types (`node_modules/@google/genai`) or current docs, correct `buildConfig`, update `tests/providers/google.test.js` to match, re-run `node --test tests/providers/google.test.js`, then re-run this smoke test.

- [ ] **Step 3: Run smoke test for the OpenAI model (requires OPENAI_API_KEY)**

Run: `node C:/Users/iambl/GitHub/AIMLAPIGUI/scripts/smoke.js gpt-image-2`
Expected: "Returned 1 image(s)." and `smoke-output.png` written.

- [ ] **Step 4: Add smoke-output.png to .gitignore and commit the script**

Add `smoke-output.png` to `.gitignore`, then:
```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add scripts/smoke.js .gitignore
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add real-API smoke test script for adapter verification"
```

**Note for reviewer:** If real keys are not available in this environment, mark Steps 2–3 as blocked and report that the SDK field names remain unverified; do not claim the adapters are confirmed working end-to-end.

---

# Phase B — Server (depends on Phase A)

### Task B1: Refactor `/api/generate` + add `/api/models` and provider health

**Files:**
- Modify: `server.js` (replace AIML block `server.js:27-121`; the chat/image endpoints below stay unchanged)
- Test: covered by Playwright in Phase D; manual curl check here.

- [ ] **Step 1: Replace the AIML generate endpoint and add helpers + new endpoints**

Replace lines `27-121` (the `/api/generate` and `/api/health` handlers) of `server.js` with:

```js
const providers = require('./providers');

// Normalize one input image source into { buffer, mimeType }.
async function urlToImage(url) {
  const dataMatch = url.match(/^data:(image\/\w+);base64,(.+)$/);
  if (dataMatch) {
    return { buffer: Buffer.from(dataMatch[2], 'base64'), mimeType: dataMatch[1] };
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch input image: ${resp.status}`);
  const mimeType = resp.headers.get('content-type') || 'image/png';
  const arrayBuf = await resp.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType };
}

// List models whose provider is configured (drives the UI dropdown).
app.get('/api/models', (req, res) => {
  res.json({ models: providers.getModels(), default: providers.DEFAULT_MODEL });
});

// Generate images for the selected model via its native provider adapter.
app.post('/api/generate', upload.array('images', 14), async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const modelId = providers.migrateModelId(model);
    const modelDef = providers.getModel(modelId);
    if (!providers.isProviderConfigured(modelDef.provider)) {
      return res.status(400).json({ error: `Provider ${modelDef.provider} is not configured` });
    }

    // Gather input images as { buffer, mimeType } from uploaded files and URLs/base64.
    const inputImages = [];
    if (req.files) {
      for (const file of req.files) inputImages.push({ buffer: file.buffer, mimeType: file.mimetype });
    }
    if (req.body.image_urls) {
      let urls;
      try { urls = JSON.parse(req.body.image_urls); } catch { urls = [req.body.image_urls]; }
      for (const url of urls) inputImages.push(await urlToImage(url));
    }

    // Options understood by adapters (each picks what it needs).
    const options = {
      resolution: req.body.resolution,
      aspectRatio: req.body.aspect_ratio,
      size: req.body.size,
      quality: req.body.quality,
      background: req.body.background,
    };

    // Preserve current behavior: fan out one call per requested image.
    const count = Math.min(parseInt(req.body.num_images) || 1, modelDef.capabilities.maxOutputs);
    console.log(`Generating ${count} image(s) with ${modelId} (${inputImages.length} input image(s))`);

    const results = await Promise.all(
      Array.from({ length: count }, () => providers.generate(modelId, { prompt, inputImages, options }))
    );
    const images = results.flatMap(r => r.images);
    res.json({ images });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check — reports which providers have keys configured.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', providers: providers.getConfiguredProviders() });
});
```

Also remove the now-unused `node-fetch` require at the top of `server.js` **only if** Node's global `fetch` is available (Node 18+). Verify Node version first (Step 2); if Node < 18, keep `const fetch = require('node-fetch');` and the `urlToImage` call works unchanged.

- [ ] **Step 2: Verify Node has global fetch**

Run: `node -v`
Expected: v18+ (global `fetch` available). If lower, keep the `node-fetch` require.

- [ ] **Step 3: Manual smoke of the endpoints**

Start the server: `npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI start` (in background), then:
Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","providers":{"google":true|false,"openai":true|false}}` reflecting your `.env`.
Run: `curl http://localhost:3000/api/models`
Expected: JSON `{ models: [...], default: "gemini-3-pro-image" }` containing only configured providers' models.
Stop the server afterward.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add server.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Refactor generate endpoint to provider adapters; add /api/models"
```

---

### Task B2: Update config files (.env, .env.example)

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local, untracked — update so the server actually runs)

- [ ] **Step 1: Rewrite `.env.example`**

```
# Google Gemini (AI Studio) API key — https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key_here

# OpenAI API key — https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration (optional)
PORT=3000
```

- [ ] **Step 2: Update local `.env`**

Edit the untracked `.env` to add `GOOGLE_API_KEY=` and `OPENAI_API_KEY=` with the user's real keys (ask the user to paste them if not present). Remove the obsolete `AIML_API_KEY` line. Confirm `/api/health` then shows the configured providers as `true`.

- [ ] **Step 3: Commit (example only; `.env` is gitignored)**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add .env.example
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Switch env config to native provider keys"
```

---

# Phase C — Frontend (depends on Phase B)

### Task C1: Client-side model registry helper

**Files:**
- Create: `public/models.js`
- Modify: `public/index.html` (add `<script src="models.js">` before `app.js` at `index.html:144`)

- [ ] **Step 1: Write `public/models.js`**

```js
// public/models.js
// Client-side cache of the server's model registry plus small capability helpers.
// Loaded before app.js; exposed as the global `ModelRegistry`.

const ModelRegistry = {
  models: [],
  defaultId: null,

  // Fetch the configured models from the server once at startup.
  async load() {
    const res = await fetch('/api/models');
    const data = await res.json();
    this.models = data.models || [];
    this.defaultId = data.default || (this.models[0] && this.models[0].id) || null;
    return this.models;
  },

  get(id) {
    return this.models.find(m => m.id === id);
  },

  capabilities(id) {
    const m = this.get(id);
    return m ? m.capabilities : null;
  },
};

window.ModelRegistry = ModelRegistry;
```

- [ ] **Step 2: Add the script tag in `index.html`**

Change `index.html:144-145` from:
```html
    <script src="storage-service.js"></script>
    <script src="app.js"></script>
```
to:
```html
    <script src="storage-service.js"></script>
    <script src="models.js"></script>
    <script src="app.js"></script>
```

- [ ] **Step 3: Verify load in browser console**

Start the server, open `http://localhost:3000`, and in the console run `await ModelRegistry.load()`.
Expected: array of model objects matching configured providers.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add public/models.js public/index.html
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add client-side model registry helper"
```

---

### Task C2: OpenAI size/quality controls in the header

**Files:**
- Modify: `public/index.html` (settings block `index.html:33-53`)

- [ ] **Step 1: Replace the static model `<option>`s and add OpenAI controls**

Replace `index.html:34-52` (the three `setting-group` divs) with:
```html
                        <div class="setting-group">
                            <label for="model-select">Model:</label>
                            <select id="model-select"></select>
                        </div>
                        <div class="setting-group">
                            <label for="num-images">Images:</label>
                            <input type="number" id="num-images" min="1" max="4" value="1">
                        </div>
                        <div class="setting-group" id="resolution-group">
                            <label for="resolution-select">Resolution:</label>
                            <select id="resolution-select"></select>
                        </div>
                        <div class="setting-group" id="size-group" style="display: none;">
                            <label for="size-select">Size:</label>
                            <select id="size-select"></select>
                        </div>
                        <div class="setting-group" id="quality-group" style="display: none;">
                            <label for="quality-select">Quality:</label>
                            <select id="quality-select"></select>
                        </div>
```

(The model `<select>` and resolution `<select>` are now populated dynamically by `app.js`.)

- [ ] **Step 2: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add public/index.html
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add dynamic model select and OpenAI size/quality controls"
```

---

### Task C3: Wire up dynamic dropdown + capability-driven controls in app.js

**Files:**
- Modify: `public/app.js` (element refs `app.js:19-21`; init/startup; add a `applyModelCapabilities` method; legacy migration at `app.js:1535`; option fields in the two FormData builders at `app.js:932-934` and `app.js:1967-1969`)

- [ ] **Step 1: Add element references**

In the `this.elements = { ... }` block (around `app.js:19-21`), add refs:
```js
            modelSelect: document.getElementById('model-select'),
            numImages: document.getElementById('num-images'),
            resolutionSelect: document.getElementById('resolution-select'),
            resolutionGroup: document.getElementById('resolution-group'),
            sizeGroup: document.getElementById('size-group'),
            sizeSelect: document.getElementById('size-select'),
            qualityGroup: document.getElementById('quality-group'),
            qualitySelect: document.getElementById('quality-select'),
```

- [ ] **Step 2: Populate models on startup**

In the app's async init (where it currently loads chats on startup), before first render, add registry loading and dropdown population. Add this method to the class:
```js
    // Load the model registry and build the model dropdown + initial controls.
    async initModels() {
        await ModelRegistry.load();
        this.elements.modelSelect.innerHTML = '';
        const groups = {};
        for (const m of ModelRegistry.models) {
            const provider = m.provider === 'google' ? 'Google' : 'OpenAI';
            if (!groups[provider]) {
                groups[provider] = document.createElement('optgroup');
                groups[provider].label = provider;
                this.elements.modelSelect.appendChild(groups[provider]);
            }
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            groups[provider].appendChild(opt);
        }
        if (ModelRegistry.defaultId) this.elements.modelSelect.value = ModelRegistry.defaultId;
        this.elements.modelSelect.addEventListener('change', () => this.applyModelCapabilities());
        this.applyModelCapabilities();
    }
```
Call `await this.initModels();` in the startup sequence (immediately after the constructor's storage/chat init begins — before rendering messages so the dropdown is ready).

- [ ] **Step 3: Add the capability-driven control logic**

Add this method to the class:
```js
    // Show/hide and repopulate header controls based on the selected model's capabilities.
    applyModelCapabilities() {
        const caps = ModelRegistry.capabilities(this.elements.modelSelect.value);
        if (!caps) return;

        const fill = (select, values) => {
            select.innerHTML = '';
            for (const v of values) {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                select.appendChild(opt);
            }
        };

        // Resolution (Gemini) vs Size+Quality (OpenAI).
        if (caps.resolutions) {
            fill(this.elements.resolutionSelect, caps.resolutions);
            this.elements.resolutionGroup.style.display = '';
        } else {
            this.elements.resolutionGroup.style.display = 'none';
        }
        if (caps.sizes) {
            fill(this.elements.sizeSelect, caps.sizes);
            this.elements.sizeGroup.style.display = '';
        } else {
            this.elements.sizeGroup.style.display = 'none';
        }
        if (caps.qualities) {
            fill(this.elements.qualitySelect, caps.qualities);
            this.elements.qualityGroup.style.display = '';
        } else {
            this.elements.qualityGroup.style.display = 'none';
        }

        // Clamp image count to the model's max outputs.
        this.elements.numImages.max = String(caps.maxOutputs);
        if (parseInt(this.elements.numImages.value) > caps.maxOutputs) {
            this.elements.numImages.value = String(caps.maxOutputs);
        }

        // Disable the upload area for generation-only models.
        const uploadArea = document.querySelector('.image-upload-area');
        if (uploadArea) {
            uploadArea.classList.toggle('upload-disabled', caps.edit === false);
        }
    }
```

- [ ] **Step 4: Send the new option fields in both FormData builders**

In `addToCurrentVersion` (`app.js:932-934`) and the other generate path (`app.js:1967-1969`), the lines currently append `model`, `num_images`, `resolution`. Replace each of those three-line blocks with a shared call. Add this helper method to the class:
```js
    // Append model + capability-appropriate option fields to a generate FormData.
    appendGenerateOptions(formData) {
        const modelId = this.elements.modelSelect.value;
        const caps = ModelRegistry.capabilities(modelId) || {};
        formData.append('model', modelId);
        formData.append('num_images', this.elements.numImages.value);
        if (caps.resolutions) formData.append('resolution', this.elements.resolutionSelect.value);
        if (caps.sizes) formData.append('size', this.elements.sizeSelect.value);
        if (caps.qualities) formData.append('quality', this.elements.qualitySelect.value);
    }
```
Then in both places replace:
```js
            formData.append('model', currentModel);
            formData.append('num_images', currentNumImages);
            formData.append('resolution', currentResolution);
```
with:
```js
            this.appendGenerateOptions(formData);
```
and delete the now-unused `currentModel` / `currentNumImages` / `currentResolution` locals in those two methods.

- [ ] **Step 5: Migrate legacy model ids when restoring a message**

At `app.js:1535`, change:
```js
        if (message.model) this.elements.modelSelect.value = message.model;
```
to:
```js
        if (message.model) {
            const migrated = ModelRegistry.get(message.model) ? message.model
                : (ModelRegistry.models.find(m => m.id) ? ModelRegistry.defaultId : message.model);
            // Map known legacy ids to the nearest native model so old chats stay usable.
            const legacy = { 'google/nano-banana-pro-edit': 'gemini-3-pro-image', 'google/gemini-3-pro-image-preview-edit': 'gemini-3-pro-image' };
            this.elements.modelSelect.value = ModelRegistry.get(message.model) ? message.model
                : (legacy[message.model] || ModelRegistry.defaultId);
            this.applyModelCapabilities();
        }
```

- [ ] **Step 6: Add disabled-upload styling**

Append to `public/style.css`:
```css
/* Generation-only models: visually disable the image upload area */
.image-upload-area.upload-disabled {
    opacity: 0.5;
    pointer-events: none;
}
```

- [ ] **Step 7: Manual integration check in browser**

Start server, open `http://localhost:3000`. Verify:
- Model dropdown shows configured models grouped by Google / OpenAI.
- Selecting a Gemini model shows **Resolution**; selecting `OpenAI Images 2.0` hides Resolution and shows **Size** + **Quality**.
- Generating with a Gemini model and with the OpenAI model both render an image into the chat (requires real keys).

- [ ] **Step 8: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add public/app.js public/style.css
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Wire dynamic model dropdown and capability-driven controls"
```

---

# Phase D — Integration tests + docs (depends on Phase C)

### Task D1: Update the test server for the new contract

**Files:**
- Modify: `tests/test-server.js` (env setup `:6-8`; add `/api/models`; `/api/generate` already returns `{ images }`)

- [ ] **Step 1: Update env + add `/api/models`**

Change `tests/test-server.js:7-8` to set provider keys instead of AIML:
```js
process.env.PORT = '3001';
process.env.GOOGLE_API_KEY = 'test_google_key';
process.env.OPENAI_API_KEY = 'test_openai_key';
```
After the `/api/generate` stub (around `:86`), add a models endpoint backed by the real registry so the dropdown is populated identically to production:
```js
const { MODELS, DEFAULT_MODEL } = require('../providers/models');
app.get('/api/models', (req, res) => {
    res.json({ models: MODELS, default: DEFAULT_MODEL });
});
```
The existing `/api/generate` stub already returns `{ images: [...] }`, which matches the new server contract — leave its body as-is.

- [ ] **Step 2: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add tests/test-server.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Update test server with /api/models and provider keys"
```

---

### Task D2: Playwright test for multi-model UI + generation

**Files:**
- Create: `tests/multi-model.spec.js`

- [ ] **Step 1: Write the test**

```js
// tests/multi-model.spec.js
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';

test.beforeEach(async ({ request }) => {
  await request.post(`${BASE}/api/test/cleanup`);
});

test('model dropdown is populated from /api/models, grouped by provider', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);
  const optionValues = await page.$$eval('#model-select option', els => els.map(e => e.value));
  expect(optionValues).toContain('gemini-3-pro-image');
  expect(optionValues).toContain('gpt-image-2');
  const groups = await page.$$eval('#model-select optgroup', els => els.map(e => e.label));
  expect(groups).toEqual(expect.arrayContaining(['Google', 'OpenAI']));
});

test('controls switch between Resolution (Gemini) and Size/Quality (OpenAI)', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);

  await page.selectOption('#model-select', 'gemini-3-pro-image');
  await expect(page.locator('#resolution-group')).toBeVisible();
  await expect(page.locator('#size-group')).toBeHidden();

  await page.selectOption('#model-select', 'gpt-image-2');
  await expect(page.locator('#resolution-group')).toBeHidden();
  await expect(page.locator('#size-group')).toBeVisible();
  await expect(page.locator('#quality-group')).toBeVisible();
});

test('generating with a Gemini model renders an image in the chat', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);
  await page.selectOption('#model-select', 'gemini-3-pro-image');
  await page.fill('#prompt-input', 'a red apple');
  await page.click('#send-btn');
  await expect(page.locator('.messages img').first()).toBeVisible({ timeout: 10000 });
});

test('generating with the OpenAI model renders an image in the chat', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);
  await page.selectOption('#model-select', 'gpt-image-2');
  await page.fill('#prompt-input', 'a blue car');
  await page.click('#send-btn');
  await expect(page.locator('.messages img').first()).toBeVisible({ timeout: 10000 });
});
```

- [ ] **Step 2: Run the new test**

Run: `npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI test -- multi-model.spec.js`
Expected: 4 passing tests. (Playwright config starts the test server; confirm `playwright.config.js` `webServer` runs `tests/test-server.js` — if it points at the real server, update it to the test server for this run.)

- [ ] **Step 3: Run the full Playwright suite (regression)**

Run: `npm --prefix C:/Users/iambl/GitHub/AIMLAPIGUI test`
Expected: existing `storage-migration.spec.js` tests still pass alongside the new ones. Fix any selector drift caused by the `index.html` settings changes.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add tests/multi-model.spec.js
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Add Playwright tests for multi-model UI and generation"
```

---

### Task D3: Documentation

**Files:**
- Create: `CLAUDE.md`, `providers/CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Write `providers/CLAUDE.md`**

Document: the adapter contract (`generate({ prompt, inputImages, options }) -> { images }`), the registry/capabilities shape, how to add a new provider (new adapter module + `ADAPTERS`/`PROVIDER_ENV` entries + registry rows), and the build-time verification note about `imageConfig`. State current behavior, not history.

- [ ] **Step 2: Write top-level `CLAUDE.md`**

Document current state: native multi-provider image app; request flow (frontend FormData → `/api/generate` → `providers.generate` → adapter → `{ images }`); model registry as source of truth; capability-driven UI; env keys (`GOOGLE_API_KEY`, `OPENAI_API_KEY`); test commands (`npm run test:unit`, `npm test`); and how it should evolve (add providers/models via the registry; deferred mask + native batching).

- [ ] **Step 3: Update `README.md`**

Replace AIML-specific content: title/intro (multi-provider native), the model list (the four models + provider/edit notes), prerequisites (Google AI Studio + OpenAI keys), `.env` setup, API Reference (native endpoints + SDKs), and dependencies (`@google/genai`, `openai`). Remove AIML endpoint references.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/iambl/GitHub/AIMLAPIGUI add CLAUDE.md providers/CLAUDE.md README.md
git -C C:/Users/iambl/GitHub/AIMLAPIGUI commit -m "Document multi-provider architecture"
```

---

## Self-Review Notes

- **Spec coverage:** adapter layer (A3–A5), registry+capabilities (A1), native SDKs (A2), config/keys (B2), `/api/models` + generate refactor + health (B1), capability-driven UI (C2–C3), legacy migration (A1 + C3 step 5), unit tests (A1/A3/A4/A5), Playwright (D1–D2), docs (D3), OpenRouter rejection (design doc), deferred mask/batching (registry/server keep it simple). All covered.
- **Build-time verifications** (spec "open items") are explicit tasks/steps: A6 (SDK field names + model id suffixes), A2 (pin versions via install), B1 Step 2 (Node fetch).
- **Type consistency:** adapter input is `{ buffer, mimeType }` and `options` everywhere; adapters return `{ images: string[] }`; `generate(modelId, { prompt, inputImages, options })` signature matches between `providers/index.js`, the server call, and the smoke script.
