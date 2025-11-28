require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
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

// API endpoint for image generation
app.post('/api/generate', upload.array('images', 10), async (req, res) => {
  try {
    const { prompt, model, num_images } = req.body;
    const apiKey = process.env.AIML_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Prepare image URLs (either from URLs or uploaded files as base64)
    let imageUrls = [];

    // Check for URL-based images
    if (req.body.image_urls) {
      try {
        imageUrls = JSON.parse(req.body.image_urls);
      } catch (e) {
        // If it's a single URL string
        imageUrls = [req.body.image_urls];
      }
    }

    // Check for uploaded files
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const base64 = file.buffer.toString('base64');
        const mimeType = file.mimetype;
        imageUrls.push(`data:${mimeType};base64,${base64}`);
      });
    }

    const requestBody = {
      model: model || 'google/nano-banana-pro-edit',
      prompt: prompt,
      num_images: parseInt(num_images) || 1
    };

    // Only add image_urls if there are images
    if (imageUrls.length > 0) {
      requestBody.image_urls = imageUrls;
    }

    console.log('Sending request to AI/ML API:', {
      ...requestBody,
      image_urls: requestBody.image_urls ? `[${requestBody.image_urls.length} images]` : 'none'
    });

    const response = await fetch('https://api.aimlapi.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('AI/ML API Error:', data);
      return res.status(response.status).json({
        error: data.error || 'Failed to generate image',
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.AIML_API_KEY
  });
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
  console.log(`API Key configured: ${!!process.env.AIML_API_KEY}`);
});
