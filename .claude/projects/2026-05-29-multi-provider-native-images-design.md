# Multi-Provider Native Image Backend — Design Spec

**Date:** 2026-05-29
**Status:** Approved design, pending implementation plan
**Branch goal:** Replace the single AIMLAPI image path with native, per-provider adapters
(Google Gemini + OpenAI GPT Image), selectable from a capability-driven UI.

## Motivation

The app today hard-assumes **one provider, one request shape, one response shape**:
`server.js` reads `AIML_API_KEY`, builds one body, and POSTs to
`https://api.aimlapi.com/v1/images/generations`. AIMLAPI takes a margin and adds
indirection. We are switching to **native provider APIs** for full feature access and
no markup, and branching out to multiple models behind a uniform adapter interface.

**OpenRouter was evaluated and rejected** as a backbone: it is the same category of
aggregator as AIMLAPI (adds margin), and its image-generation support is limited to a
few Gemini-family models via the chat `modalities` path — OpenAI's Images API is not
exposed through it. The adapter design below makes OpenRouter trivially addable later as
just one more adapter if ever wanted, so nothing is foreclosed.

## Model lineup

| Model | ID (verify suffix at build) | Provider | Edit | Notes |
|---|---|---|---|---|
| Gemini 3 Pro Image (Nano Banana Pro) | `gemini-3-pro-image` | google | yes | up to 4K, multi-image edit |
| Gemini 2.5 Flash Image (Nano Banana) | `gemini-2.5-flash-image` | google | yes | fast; verify res ceiling (≈2K) |
| Nano Banana 2 | `gemini-3.1-flash-image` | google | yes | up to 4K, also supports `512` |
| OpenAI Images 2.0 | `gpt-image-2` | openai | yes | snapshot `gpt-image-2-2026-04-21` |

**Decisions:**
- Native only. AIMLAPI path is fully removed (clean break, no feature flag).
- Full parity (generation **and** editing) for every model from day one.
- Nano Banana 2 has `edit: true` — official Google docs demonstrate editing with this
  model ID, contradicting an earlier assumption that it was generation-only.
- **Deferred (add later when needed):** OpenAI edit mask input; native batching (`n`).

## Libraries (modern, official)

Adapters use the official SDKs instead of raw `node-fetch` — smaller, clearer adapters:
- **`@google/genai`** — Google GenAI JS SDK. `ai.models.generateContent({ model, contents, config })`.
- **`openai`** — `openai.images.generate(...)` and `openai.images.edit({ image: [...] })` with `toFile`.

`node-fetch` remains only where still used (image downloads in `storage.js`).

## Architecture

### Provider adapter layer (`providers/`)

```
providers/
  models.js    # model registry: id -> { label, provider, capabilities }
  google.js    # Gemini adapter (uses @google/genai)
  openai.js    # GPT Image adapter (uses openai)
  index.js     # registry lookup, key-presence filtering, dispatch
  CLAUDE.md
```

**Adapter contract** (every adapter implements):

```js
// inputImages already normalized to buffers by the server (provider-agnostic).
// Returns generated images as data URLs (base64). count is handled by the caller
// (server fans out one call per image), preserving today's 1-N behavior.
async function generate({ prompt, inputImages, options }) -> { images: string[] }
//   inputImages: Array<{ buffer: Buffer, mimeType: string }>
//   options:     { resolution?, aspectRatio?, size?, quality?, background?, outputFormat? }
//   images out:  ["data:image/png;base64,..."]
```

**Google adapter** (`google.js`):
- `new GoogleGenAI({ apiKey: GOOGLE_API_KEY })`.
- `contents`: prompt text plus one `{ inlineData: { mimeType, data: base64 } }` part per input image.
- `config`: `responseModalities: ['TEXT','IMAGE']` plus image config carrying
  `imageSize` (`512`/`1K`/`2K`/`4K`, from `options.resolution`) and optional `aspectRatio`.
  **Verify exact config field name** (`imageConfig` vs `responseFormat.image`) against the
  installed SDK version with a real smoke test before finalizing.
- Output: read `candidates[0].content.parts[].inlineData.data` → `data:<mime>;base64,<data>`.

**OpenAI adapter** (`openai.js`):
- `new OpenAI({ apiKey: OPENAI_API_KEY })`.
- No input images → `images.generate({ model, prompt, size, quality, background, output_format })`.
- Input images present → `images.edit({ model, image: [toFile(...)...], prompt, size, quality })`.
- Map `options.size`/`quality`/`background`/`outputFormat`. Do **not** send `input_fidelity`.
- Output: `data[].b64_json` → `data:image/png;base64,<data>` (or chosen format).

### Model registry & capabilities (`providers/models.js`)

Single source of truth. Capability flags drive both server validation and UI rendering.

```js
[
  { id: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image (Nano Banana Pro)',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14,
                    resolutions: ['1K','2K','4K'], maxOutputs: 4 } },
  { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (Nano Banana)',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14,
                    resolutions: ['1K','2K'], maxOutputs: 4 } },
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2',
    provider: 'google',
    capabilities: { edit: true, multiImageInput: true, maxInputImages: 14,
                    resolutions: ['512','1K','2K','4K'], maxOutputs: 4 } },
  { id: 'gpt-image-2', label: 'OpenAI Images 2.0',
    provider: 'openai',
    capabilities: { edit: true, multiImageInput: true,
                    sizes: ['auto','1024x1024','1536x1024','1024x1536','2048x2048','3840x2160','2160x3840'],
                    qualities: ['auto','low','medium','high'], maxOutputs: 4 } },
]
```
Exact resolution ceilings / size lists are verified per-model at build time.

### Config / API keys

`.env` (and `.env.example`) drop `AIML_API_KEY`, gain:
```
GOOGLE_API_KEY=...
OPENAI_API_KEY=...
PORT=3000
```
`providers/index.js` `getModels()` returns only models whose provider key is set, so the
UI never offers an unusable model.

### Server endpoints (`server.js`)

- **`GET /api/models`** *(new)* — capability-annotated model list, filtered to configured providers.
- **`POST /api/generate`** *(refactored)* — keep provider-agnostic input gathering
  (multer files, base64, external URLs) but normalize **all** inputs to
  `{ buffer, mimeType }`; look up the model's provider; fan out `count` adapter calls;
  return `{ images: [...] }`. External URLs are downloaded to buffers server-side.
- **`GET /api/health`** — `{ providers: { google: bool, openai: bool } }`.

### Frontend (capability-driven)

- On load, fetch `/api/models`; cache it; populate `#model-select` dynamically with
  optgroups (Google / OpenAI), replacing the two hardcoded `<option>`s in `index.html`.
- New isolated helper **`public/models.js`** (fetch + cache + capability queries) so this
  concern stays bounded instead of swelling the 2540-line `app.js`.
- On model change, reshape controls from capabilities:
  - `resolutions` present → show **Resolution** select (Gemini), options from the model.
  - `sizes`/`qualities` present → show **Size** + **Quality** selects (OpenAI) instead.
  - `edit: false` → disable the upload area with a hint. (None currently; logic still built.)
  - clamp **Images** to `maxOutputs`.
- Generate request sends `model` + discrete option fields; server assembles `options`.

### Legacy chat migration

Old chats store AIML model strings. Map to nearest native model where `message.model` is
read (≈`app.js:1535`) and/or on chat load:
- `google/nano-banana-pro-edit` → `gemini-3-pro-image`
- `google/gemini-3-pro-image-preview-edit` → `gemini-3-pro-image`
- unknown / missing → default model (`gemini-3-pro-image`).

## Testing (TDD)

**Adapter unit tests** (stub the SDK / `fetch`):
- `getModels()` filters by configured keys.
- Google adapter: correct `generateContent` body (modalities, inlineData inputs);
  normalizes `inlineData` output → data URLs.
- OpenAI adapter: chooses `generate` vs `edit` by input presence; maps size/quality;
  normalizes `b64_json` → data URLs.
- Legacy model migration map.

**Playwright integration** (`tests/`): test server stubs `generativelanguage.googleapis.com`
and `api.openai.com`. Verify: dropdown populates from `/api/models`; capability controls
toggle (resolution ↔ size/quality); end-to-end generate renders an image bubble for one
Google and one OpenAI model.

## Docs

- New top-level `CLAUDE.md` and `providers/CLAUDE.md` documenting current state.
- Update `README.md` and `.env.example` (drop AIML, add the two native keys, SDKs).

## Execution (Sonnet subagents)

Phased so dependencies are explicit:
- **A — Provider layer:** `providers/*`, registry, SDK deps, adapter unit tests. (no deps)
- **B — Server:** refactor `/api/generate`, add `/api/models`, update `/api/health`, config. (needs A)
- **C — Frontend:** `public/models.js`, dynamic dropdown, capability controls, migration. (needs B)
- **D — Integration + docs:** Playwright stubs + tests, CLAUDE.md/README/.env.example. (last)

## Open items to verify at build time (not assumptions to ship)

1. Exact Gemini model-ID suffixes (`gemini-3-pro-image` vs `…-preview`).
2. Exact `@google/genai` image-config field name and resolution ceilings per model.
3. `@google/genai` and `openai` package versions; pin in `package.json`.
