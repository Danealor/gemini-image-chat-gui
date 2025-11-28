/**
 * Test server that stubs out AI/ML API calls
 * Uses port 3001 and a separate test data directory
 */

// Set test environment
process.env.PORT = '3001';
process.env.AIML_API_KEY = 'test_key_do_not_use_real_tokens';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Override storage paths for testing
const testDataDir = path.join(__dirname, 'test-data');
const storageModule = require('../storage');

// Monkey-patch the storage module to use test directory
const originalModule = { ...storageModule };
const DATA_DIR = testDataDir;
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const INPUT_IMAGES_DIR = path.join(IMAGES_DIR, 'input');
const GENERATED_IMAGES_DIR = path.join(IMAGES_DIR, 'generated');

// Create test directories
function ensureTestDirectories() {
    const dirs = [DATA_DIR, CHATS_DIR, IMAGES_DIR, INPUT_IMAGES_DIR, GENERATED_IMAGES_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

// Clean test data
function cleanTestData() {
    if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true, force: true });
    }
}

// Initialize
cleanTestData();
ensureTestDirectories();

const app = express();
const PORT = 3001;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Stub the /api/generate endpoint
app.post('/api/generate', upload.array('images', 10), async (req, res) => {
    try {
        const { prompt, model, num_images } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Generate fake image URLs
        const numImages = parseInt(num_images) || 1;
        const images = [];

        for (let i = 0; i < numImages; i++) {
            // Return a data URL with a 1x1 transparent PNG
            images.push('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        }

        res.json({
            images,
            model: model || 'google/nano-banana-pro-edit'
        });
    } catch (error) {
        console.error('Test server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        hasApiKey: true,
        testMode: true
    });
});

// Chat endpoints (use test storage paths)
app.get('/api/chats', async (req, res) => {
    try {
        const files = fs.readdirSync(CHATS_DIR);
        const chatFiles = files.filter(f => f.endsWith('.json'));
        const chats = [];

        for (const file of chatFiles) {
            const data = fs.readFileSync(path.join(CHATS_DIR, file), 'utf8');
            chats.push(JSON.parse(data));
        }

        res.json({ chats });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({ chats: [] });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.get('/api/chats/:chatId', async (req, res) => {
    try {
        const filePath = path.join(CHATS_DIR, `${req.params.chatId}.json`);
        const data = fs.readFileSync(filePath, 'utf8');
        res.json({ chat: JSON.parse(data) });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Chat not found' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.post('/api/chats', async (req, res) => {
    try {
        const chat = req.body.chat;
        if (!chat || !chat.id) {
            return res.status(400).json({ error: 'Invalid chat data' });
        }
        const filePath = path.join(CHATS_DIR, `${chat.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), 'utf8');
        res.json({ chat });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/chats/:chatId', async (req, res) => {
    try {
        const chat = req.body.chat;
        if (!chat) {
            return res.status(400).json({ error: 'Invalid chat data' });
        }
        const filePath = path.join(CHATS_DIR, `${req.params.chatId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), 'utf8');
        res.json({ success: true, chat });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/chats/:chatId', async (req, res) => {
    try {
        const filePath = path.join(CHATS_DIR, `${req.params.chatId}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete associated images
        const dirs = [INPUT_IMAGES_DIR, GENERATED_IMAGES_DIR];
        for (const dir of dirs) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                const chatFiles = files.filter(f => f.startsWith(req.params.chatId + '_'));
                for (const file of chatFiles) {
                    fs.unlinkSync(path.join(dir, file));
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Image endpoints
app.post('/api/images/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { chatId, messageIndex, imageIndex } = req.body;
        const ext = req.file.mimetype.split('/')[1] || 'png';
        const filename = `${chatId}_${messageIndex}_${imageIndex}.${ext}`;
        const filePath = path.join(INPUT_IMAGES_DIR, filename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            url: `/api/images/input/${filename}`,
            filename
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/images/save-generated', async (req, res) => {
    try {
        const { imageUrl, base64, chatId, messageIndex, versionIndex, imageIndex } = req.body;
        const filename = `${chatId}_msg${messageIndex}_v${versionIndex}_${imageIndex}.png`;
        const filePath = path.join(GENERATED_IMAGES_DIR, filename);

        if (base64) {
            const matches = base64.match(/^data:image\/\w+;base64,(.+)$/);
            if (!matches) {
                return res.status(400).json({ error: 'Invalid base64 format' });
            }
            const buffer = Buffer.from(matches[1], 'base64');
            fs.writeFileSync(filePath, buffer);
        } else if (imageUrl) {
            // For test, just write a dummy file
            fs.writeFileSync(filePath, Buffer.from('fake image data'));
        } else {
            return res.status(400).json({ error: 'No image data provided' });
        }

        res.json({
            url: `/api/images/generated/${filename}`,
            filename
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/images/:type/:filename', (req, res) => {
    const { type, filename } = req.params;
    const dir = type === 'input' ? INPUT_IMAGES_DIR : GENERATED_IMAGES_DIR;
    const filePath = path.join(dir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Image not found' });
    }

    res.sendFile(filePath);
});

const server = app.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
    console.log(`Test data directory: ${testDataDir}`);
});

// Clean up on exit
process.on('SIGTERM', () => {
    server.close(() => {
        cleanTestData();
        process.exit(0);
    });
});
