require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API Key configured: ${!!process.env.AIML_API_KEY}`);
});
