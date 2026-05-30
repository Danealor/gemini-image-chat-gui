# providers/ — Multi-Provider Image Adapter Layer

This directory implements a thin, uniform adapter layer that isolates provider-specific image
generation logic from the rest of the application. The server (`server.js`) and unit tests
interact only with `providers/index.js`; adapters are interchangeable behind a fixed contract.

## Adapter contract

Every provider adapter (`google.js`, `openai.js`) exports a `generate` function with this signature:

```js
async function generate({ model, prompt, inputImages, options }) -> { images: string[] }
```

- `model` — the model id string (e.g. `'gemini-3-pro-image'`, `'gpt-image-2'`)
- `prompt` — text prompt
- `inputImages` — `Array<{ buffer: Buffer, mimeType: string }>`, already normalized by the server
- `options` — `{ resolution?, aspectRatio?, size?, quality?, background? }`; each adapter picks the fields it understands and ignores the rest
- `images` — generated images as `data:<mime>;base64,<data>` URLs

The server fans out one `generate()` call per requested image count (preserving the 1-N
behavior); adapters always return a single-image array per call.

## Model registry (`models.js`)

`models.js` is the single source of truth for every selectable model. Both the server and the
frontend consume this registry. Each entry has:

```js
{
  id: string,           // used in API requests and stored in chat history
  label: string,        // displayed in the UI dropdown
  provider: string,     // 'google' | 'openai' — matches a key in ADAPTERS/PROVIDER_ENV
  capabilities: {
    edit: boolean,                  // whether the model accepts input images
    multiImageInput: boolean,       // whether multiple input images are supported
    maxInputImages: number,         // hard cap on input image count
    resolutions?: string[],         // Gemini: available resolution strings ('1K','2K','4K',...)
    sizes?: string[],               // OpenAI: available size strings
    qualities?: string[],           // OpenAI: available quality strings
    maxOutputs: number,             // max images per generate call
  }
}
```

The four registered models:

| ID | Label | Provider | Edit |
|---|---|---|---|
| `gemini-3-pro-image` | Gemini 3 Pro Image (Nano Banana Pro) | google | yes |
| `gemini-2.5-flash-image` | Gemini 2.5 Flash Image (Nano Banana) | google | yes |
| `gemini-3.1-flash-image` | Nano Banana 2 | google | yes |
| `gpt-image-2` | OpenAI Images 2.0 | openai | yes |

`migrateModelId(id)` maps legacy AIML model strings stored in old chats to the nearest native
model, falling back to `DEFAULT_MODEL` for unknown or missing ids.

## Dispatch layer (`index.js`)

`providers/index.js` provides:

- `getModels()` — returns only models whose provider has an API key in `process.env` (the only ones the UI should offer)
- `getConfiguredProviders()` — `{ google: bool, openai: bool }` reflecting which keys are set
- `generate(modelId, { prompt, inputImages, options })` — looks up the model, validates provider is configured, dispatches to the correct adapter
- Re-exports `getModel`, `migrateModelId`, `DEFAULT_MODEL` from `models.js` for server convenience

Provider keys:

| Provider | Env variable |
|---|---|
| google | `GOOGLE_API_KEY` |
| openai | `OPENAI_API_KEY` |

## Google adapter (`google.js`)

Uses `@google/genai` (`GoogleGenAI`). Key implementation details:

- `buildContents(prompt, inputImages)` — prompt text first, then one `inlineData` part per input image (base64-encoded)
- `buildConfig(options)` — always sets `responseModalities: ['TEXT', 'IMAGE']`; adds `imageConfig: { imageSize, aspectRatio }` when resolution/aspectRatio options are provided
- `parseResponse(response)` — extracts `candidates[0].content.parts[].inlineData` entries into data URLs, ignoring text parts
- The `imageConfig` field name and `imageSize` casing (`'1K'`, `'2K'`, `'4K'`, `'512'`) must match the installed SDK version. Run `node scripts/smoke.js gemini-3-pro-image` with a real key to verify after SDK version changes.

## OpenAI adapter (`openai.js`)

Uses the `openai` SDK. Key implementation details:

- `buildParams(model, prompt, options)` — builds the shared request params; `'auto'` sentinel values are dropped so the API uses its own default
- `isEdit(inputImages)` — returns true when input images are present
- No input images → `images.generate(params)`; input images present → `images.edit({ image: [toFile(...)...], ...params })`
- `parseResponse(response)` — maps `data[].b64_json` to `data:image/png;base64,<data>` URLs

## Adding a new provider

1. Create `providers/<name>.js` implementing `generate({ model, prompt, inputImages, options })`.
2. Export any pure builder/parser functions for unit testing (no network required in tests).
3. Add the adapter to `ADAPTERS` and its env key to `PROVIDER_ENV` in `providers/index.js`.
4. Add the model entry (or entries) to the `MODELS` array in `providers/models.js` with correct `provider` and `capabilities`.
5. Add unit tests in `tests/providers/<name>.test.js` covering builders and response parsers.
6. Run `npm run test:unit` and `npm test` to verify.

## Testing

Unit tests in `tests/providers/` use Node's built-in `node:test` runner (no additional test framework).
Pure builder and parser functions are tested directly without any network calls or SDK mocking.

Run unit tests: `npm run test:unit`
Run integration tests (Playwright): `npm test`

## Appendix

- The AIML API path was fully removed; this is a clean break with no fallback or feature flag.
- OpenRouter was evaluated and rejected: it is an aggregator (same category as AIML), adds margin, and does not expose OpenAI's Images API. It can be added as a provider adapter later without any architectural changes.
- Deferred for future: OpenAI edit mask input; native batching via the `n` parameter (currently the server fans out one call per image).
- The `imageConfig` field name in `@google/genai` may differ across SDK versions — always verify with a real smoke test after upgrading the SDK.
