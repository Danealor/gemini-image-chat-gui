# AIMLAPIGUI — Multi-Provider Image Generation Chat

A Node.js web application providing an AI Studio-style chat interface for generating and
editing images using native provider APIs. The backend dispatches to Google Gemini or
OpenAI GPT Image based on the selected model; the frontend adapts its controls to each
model's capabilities.

## Architecture

### Request flow

```
Browser FormData
  → POST /api/generate (server.js)
    → urlToImage() / multer files → { buffer, mimeType }[]  (normalize inputs)
    → providers.generate(modelId, { prompt, inputImages, options })  (providers/index.js)
      → adapter.generate(...)  (providers/google.js or providers/openai.js)
        → SDK call → parseResponse()
    → { images: ["data:image/png;base64,..."] }
  → chat renders image bubble
```

### Model registry as source of truth

`providers/models.js` holds the single definition of every selectable model, including its
provider, display label, and capability flags. Both `server.js` (for validation and dispatch)
and the frontend (`public/models.js`) consume this registry. Adding a new model requires only
a new entry in the registry plus an adapter (see `providers/CLAUDE.md`).

### Capability-driven UI

On startup, the frontend fetches `/api/models` and populates the dropdown dynamically. When
the user changes model selection, `applyModelCapabilities()` in `app.js` shows/hides controls:

- Gemini models → **Resolution** select; Size and Quality hidden
- OpenAI models → **Size** and **Quality** selects; Resolution hidden
- All models: **Images** count clamped to `capabilities.maxOutputs`

### Provider keys and model availability

`providers/index.js`'s `getModels()` returns only models whose provider has an API key in
`process.env`. The UI never offers an unconfigured model. Env keys:

| Provider | Env variable |
|---|---|
| Google Gemini | `GOOGLE_API_KEY` |
| OpenAI GPT Image | `OPENAI_API_KEY` |

## Directory structure

```
AIMLAPIGUI/
├── providers/          # Provider adapter layer (see providers/CLAUDE.md)
│   ├── models.js       # Model registry — single source of truth
│   ├── google.js       # Google Gemini adapter (@google/genai)
│   ├── openai.js       # OpenAI GPT Image adapter (openai)
│   └── index.js        # Key-presence filtering + dispatch
├── public/
│   ├── index.html      # Main HTML; model select and controls populated dynamically
│   ├── style.css       # Dark theme styling
│   ├── models.js       # Client-side registry cache + capability helpers (ModelRegistry)
│   ├── app.js          # Chat UI logic (GeminiChat class)
│   └── storage-service.js  # Client-side API wrapper for chat/image storage
├── tests/
│   ├── test-server.js           # Stub server for Playwright (port 3001)
│   ├── multi-model.spec.js      # Playwright: dropdown, controls, generation per provider
│   ├── storage-migration.spec.js # Playwright: chat persistence, images, regeneration
│   └── providers/               # node:test unit tests for the adapter layer
│       ├── models.test.js
│       ├── google.test.js
│       ├── openai.test.js
│       └── index.test.js
├── scripts/
│   └── smoke.js        # Manual real-API smoke test (requires live keys)
├── storage.js          # Server-side file system storage for chats and images
├── server.js           # Express server: /api/generate, /api/models, /api/health
├── playwright.config.js
└── package.json
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/models` | Configured models list with capabilities; drives the UI dropdown |
| POST | `/api/generate` | Generate images; dispatches to the model's adapter |
| GET | `/api/health` | `{ status, providers: { google: bool, openai: bool } }` |
| GET/POST/PUT/DELETE | `/api/chats[/:id]` | Chat history CRUD |
| POST | `/api/images/upload` | Store user-uploaded input images |
| POST | `/api/images/save-generated` | Save generated images to disk |
| GET | `/api/images/:type/:filename` | Serve stored images |

## Test commands

```bash
# Provider unit tests (node:test, no network, fast)
npm run test:unit

# Full Playwright integration suite (stub server on port 3001)
npm test

# Headed browser run (see the tests execute)
npm run test:headed
```

## Legacy chat migration

Old chats may contain AIML model strings. `providers/migrateModelId()` maps them to the
nearest current native model. The app calls this whenever it reads a stored `message.model`.

## How to evolve

- **Add a new model** to an existing provider: add an entry to `MODELS` in `providers/models.js`.
- **Add a new provider**: see `providers/CLAUDE.md` for the step-by-step checklist.
- **Deferred features**: OpenAI edit mask input; native batching via `n` parameter (currently
  the server fans out one call per image count).

## Data storage

Chat history and images are stored in `data/` on the server's file system (gitignored):

```
data/
├── chats/       # Chat JSON files (one per chat)
└── images/
    ├── input/       # User-uploaded images
    └── generated/   # AI-generated images
```

## Appendix

- This project replaced a single-provider AIMLAPI path with native per-provider adapters.
  The AIML path is fully removed; there is no feature flag or fallback.
- OpenRouter was evaluated and rejected as a backbone (aggregator, adds margin, no OpenAI
  Images API). It can be added as a provider adapter later without architectural changes.
