require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directories exist on startup
storage.ensureDirectories();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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

// ===== Chat Management Endpoints =====

// List all chats (metadata)
app.get('/api/chats', async (req, res) => {
  try {
    const chats = await storage.loadAllChats();
    res.json({ chats });
  } catch (error) {
    console.error('Error loading chats:', error);
    res.status(500).json({ error: 'Failed to load chats', details: error.message });
  }
});

// Get single chat
app.get('/api/chats/:chatId', async (req, res) => {
  try {
    const chat = await storage.loadChat(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ chat });
  } catch (error) {
    console.error('Error loading chat:', error);
    res.status(500).json({ error: 'Failed to load chat', details: error.message });
  }
});

// Create new chat
app.post('/api/chats', async (req, res) => {
  try {
    const chat = req.body.chat;
    if (!chat || !chat.id) {
      return res.status(400).json({ error: 'Invalid chat data: missing chat or chat.id' });
    }
    await storage.saveChat(chat.id, chat);
    res.json({ chat });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat', details: error.message });
  }
});

// Update chat
app.put('/api/chats/:chatId', async (req, res) => {
  try {
    const chat = req.body.chat;
    if (!chat) {
      return res.status(400).json({ error: 'Invalid chat data: missing chat' });
    }
    await storage.saveChat(req.params.chatId, chat);
    res.json({ success: true, chat });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ error: 'Failed to update chat', details: error.message });
  }
});

// Delete chat
app.delete('/api/chats/:chatId', async (req, res) => {
  try {
    await storage.deleteChat(req.params.chatId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat', details: error.message });
  }
});

// ===== Image Endpoints =====

// Upload user image
app.post('/api/images/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { chatId, messageIndex, imageIndex } = req.body;
    if (!chatId || messageIndex === undefined || imageIndex === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: chatId, messageIndex, imageIndex' });
    }

    const ext = storage.getImageExtension(req.file.mimetype);
    const filename = `${chatId}_${messageIndex}_${imageIndex}.${ext}`;

    await storage.saveImage(req.file.buffer, 'input', filename);

    res.json({
      url: `/api/images/input/${filename}`,
      filename
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to save image', details: error.message });
  }
});

// Save generated image (from URL or base64)
app.post('/api/images/save-generated', async (req, res) => {
  try {
    const { imageUrl, base64, chatId, messageIndex, versionIndex, imageIndex } = req.body;

    if (!chatId || messageIndex === undefined || versionIndex === undefined || imageIndex === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const filename = `${chatId}_msg${messageIndex}_v${versionIndex}_${imageIndex}.png`;

    if (base64) {
      // Convert base64 to buffer
      const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: 'Invalid base64 format' });
      }
      const buffer = Buffer.from(matches[1], 'base64');
      await storage.saveImage(buffer, 'generated', filename);
    } else if (imageUrl) {
      // Download from URL
      await storage.downloadAndSaveImage(imageUrl, 'generated', filename);
    } else {
      return res.status(400).json({ error: 'No image data provided (need imageUrl or base64)' });
    }

    res.json({
      url: `/api/images/generated/${filename}`,
      filename
    });
  } catch (error) {
    console.error('Error saving generated image:', error);
    res.status(500).json({ error: 'Failed to save generated image', details: error.message });
  }
});

// Serve images
app.get('/api/images/:type/:filename', (req, res) => {
  const { type, filename } = req.params;

  if (type !== 'input' && type !== 'generated') {
    return res.status(400).json({ error: 'Invalid image type (must be input or generated)' });
  }

  const filePath = path.join(__dirname, 'data', 'images', type, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const configured = providers.getConfiguredProviders();
  console.log(`Providers configured: google=${configured.google} openai=${configured.openai}`);
});
