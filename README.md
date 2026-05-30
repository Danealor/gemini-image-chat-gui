# Multi-Provider Image Generation Chat

A Node.js web application providing an AI Studio-style chat interface for generating and
editing images. The backend uses native provider SDKs — Google Gemini via `@google/genai`
and OpenAI GPT Image via `openai` — selected through a capability-driven UI.

## Models

| Model | ID | Provider | Edit | Resolution / Size options |
|---|---|---|---|---|
| Gemini 3 Pro Image (Nano Banana Pro) | `gemini-3-pro-image` | Google | yes | 1K, 2K, 4K |
| Gemini 2.5 Flash Image (Nano Banana) | `gemini-2.5-flash-image` | Google | yes | 1K, 2K |
| Nano Banana 2 | `gemini-3.1-flash-image` | Google | yes | 512, 1K, 2K, 4K |
| OpenAI Images 2.0 | `gpt-image-2` | OpenAI | yes | 1024x1024, 1536x1024, ... |

Only models whose provider key is configured appear in the UI dropdown.

## Features

### Chat interface
- Dark theme modeled after AI Studio
- Persistent chat history stored server-side (no 5 MB localStorage limit)
- Sidebar with date-grouped chat history; create, switch, and delete chats

### Image generation and editing
- Generate 1–4 images per request (clamped to each model's `maxOutputs`)
- Input images from file upload, URL, drag & drop, or paste
- Click-to-open lightbox with version navigation
- All four models support editing (input images sent as `inlineData` or `toFile`)

### Version management
- **Regenerate** — create multiple versions of the same prompt
- **Version arrows** — navigate between regenerations
- **Edit message** — modify a prompt and regenerate
- **Copy to new chat** — carry a prompt and its images to a fresh chat

### Capability-driven controls
- Model dropdown populated dynamically from `/api/models`
- Gemini models show **Resolution** (1K / 2K / 4K / 512)
- OpenAI models show **Size** and **Quality** instead

## Prerequisites

- Node.js v18 or higher (global `fetch` required)
- **Google AI Studio API key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

At least one key is required; the UI only offers models whose provider is configured.

## Installation

1. Clone or download this repository.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your API keys:
   ```
   GOOGLE_API_KEY=your_google_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

## Usage

Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

- Select a model from the dropdown (only configured-provider models appear)
- Set image count and resolution/size/quality as desired
- Optionally upload or paste images for editing
- Enter a prompt and click **Generate**

## Testing

```bash
# Provider unit tests (fast, no network)
npm run test:unit

# Full Playwright integration suite
npm test

# Headed browser run
npm run test:headed
```

The Playwright suite runs against a stub server on port 3001 (started automatically by the
config). `storage-migration.spec.js` covers chat persistence, image upload, regeneration, and
multi-chat management. `multi-model.spec.js` covers the dynamic dropdown, capability control
switching, and end-to-end image generation for both Google and OpenAI models.

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/models` | Configured model list with capabilities |
| POST | `/api/generate` | Generate images; dispatches to the model's native provider |
| GET | `/api/health` | `{ status, providers: { google, openai } }` |

`POST /api/generate` accepts multipart form data:

| Field | Type | Description |
|---|---|---|
| `prompt` | string | Required |
| `model` | string | Model id (e.g. `gemini-3-pro-image`) |
| `num_images` | number | 1–4 |
| `resolution` | string | Gemini: `1K`, `2K`, `4K`, `512` |
| `size` | string | OpenAI: `1024x1024`, `1536x1024`, etc. |
| `quality` | string | OpenAI: `auto`, `low`, `medium`, `high` |
| `images` | file[] | Input images (multipart upload) |
| `image_urls` | JSON string | External image URLs (fetched server-side) |

## Project structure

```
AIMLAPIGUI/
├── providers/              # Provider adapter layer
│   ├── models.js           # Model registry — single source of truth
│   ├── google.js           # Gemini adapter (@google/genai)
│   ├── openai.js           # GPT Image adapter (openai)
│   ├── index.js            # Key-filtering + dispatch
│   └── CLAUDE.md
├── public/
│   ├── index.html
│   ├── style.css
│   ├── models.js           # Client-side registry cache (ModelRegistry)
│   ├── app.js              # Chat UI (GeminiChat class)
│   └── storage-service.js
├── tests/
│   ├── test-server.js
│   ├── multi-model.spec.js
│   ├── storage-migration.spec.js
│   └── providers/          # node:test unit tests
├── scripts/
│   └── smoke.js            # Manual real-API smoke test
├── storage.js
├── server.js
├── playwright.config.js
├── .env.example
└── package.json
```

## Data storage

Chat history and images are stored in `data/` (gitignored):

```
data/
├── chats/           # Chat JSON files (one per chat)
└── images/
    ├── input/       # User-uploaded images
    └── generated/   # AI-generated images
```

## Dependencies

### Runtime
- **express** — web server
- **dotenv** — environment variables
- **multer** — file uploads
- **@google/genai** — Google Gemini SDK
- **openai** — OpenAI SDK
- **node-fetch** — used by `storage.js` for downloading stored images

### Development
- **nodemon** — auto-restart in dev
- **@playwright/test** — integration tests
