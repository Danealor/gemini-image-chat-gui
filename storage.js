const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const INPUT_IMAGES_DIR = path.join(IMAGES_DIR, 'input');
const GENERATED_IMAGES_DIR = path.join(IMAGES_DIR, 'generated');

/**
 * Ensure all required directories exist
 */
function ensureDirectories() {
    const dirs = [DATA_DIR, CHATS_DIR, IMAGES_DIR, INPUT_IMAGES_DIR, GENERATED_IMAGES_DIR];

    for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
            fsSync.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    }
}

/**
 * Save chat data to disk
 * @param {string} chatId - Chat ID
 * @param {object} chatData - Chat object to save
 */
async function saveChat(chatId, chatData) {
    const filePath = path.join(CHATS_DIR, `${chatId}.json`);
    await fs.writeFile(filePath, JSON.stringify(chatData, null, 2), 'utf8');
}

/**
 * Load a single chat from disk
 * @param {string} chatId - Chat ID
 * @returns {object|null} Chat object or null if not found
 */
async function loadChat(chatId) {
    const filePath = path.join(CHATS_DIR, `${chatId}.json`);

    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // Chat doesn't exist
        }
        throw error;
    }
}

/**
 * Load all chats from disk (metadata only for performance)
 * @returns {Array} Array of chat objects
 */
async function loadAllChats() {
    try {
        const files = await fs.readdir(CHATS_DIR);
        const chatFiles = files.filter(f => f.endsWith('.json'));

        const chats = [];
        for (const file of chatFiles) {
            try {
                const filePath = path.join(CHATS_DIR, file);
                const data = await fs.readFile(filePath, 'utf8');
                const chat = JSON.parse(data);

                // Return full chat for now (can optimize later to return metadata only)
                chats.push(chat);
            } catch (error) {
                console.error(`Error loading chat ${file}:`, error.message);
            }
        }

        return chats;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // Directory doesn't exist yet
        }
        throw error;
    }
}

/**
 * Check if a chat exists
 * @param {string} chatId - Chat ID
 * @returns {boolean}
 */
async function chatExists(chatId) {
    const filePath = path.join(CHATS_DIR, `${chatId}.json`);
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Delete a chat and all its associated images
 * @param {string} chatId - Chat ID
 */
async function deleteChat(chatId) {
    // Delete chat JSON file
    const chatFile = path.join(CHATS_DIR, `${chatId}.json`);
    try {
        await fs.unlink(chatFile);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    // Delete all images for this chat
    await deleteImagesForChat(chatId);
}

/**
 * Save an image to disk
 * @param {Buffer} buffer - Image data
 * @param {string} type - 'input' or 'generated'
 * @param {string} filename - Image filename
 */
async function saveImage(buffer, type, filename) {
    const dir = type === 'input' ? INPUT_IMAGES_DIR : GENERATED_IMAGES_DIR;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buffer);
}

/**
 * Delete a single image
 * @param {string} type - 'input' or 'generated'
 * @param {string} filename - Image filename
 */
async function deleteImage(type, filename) {
    const dir = type === 'input' ? INPUT_IMAGES_DIR : GENERATED_IMAGES_DIR;
    const filePath = path.join(dir, filename);

    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

/**
 * Delete all images associated with a chat
 * @param {string} chatId - Chat ID
 */
async function deleteImagesForChat(chatId) {
    const dirs = [INPUT_IMAGES_DIR, GENERATED_IMAGES_DIR];

    for (const dir of dirs) {
        try {
            const files = await fs.readdir(dir);

            // Find all files that start with the chatId
            const chatFiles = files.filter(f => f.startsWith(chatId + '_'));

            // Delete each file
            for (const file of chatFiles) {
                try {
                    await fs.unlink(path.join(dir, file));
                } catch (error) {
                    console.error(`Error deleting image ${file}:`, error.message);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error reading directory ${dir}:`, error.message);
            }
        }
    }
}

/**
 * Download image from URL and save to disk
 * @param {string} url - Image URL
 * @param {string} type - 'input' or 'generated'
 * @param {string} filename - Filename to save as
 */
async function downloadAndSaveImage(url, type, filename) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', async () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    await saveImage(buffer, type, filename);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {string} File extension (e.g., 'png')
 */
function getImageExtension(mimeType) {
    const mimeMap = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };

    return mimeMap[mimeType] || 'png';
}

module.exports = {
    ensureDirectories,
    saveChat,
    loadChat,
    loadAllChats,
    chatExists,
    deleteChat,
    saveImage,
    deleteImage,
    deleteImagesForChat,
    downloadAndSaveImage,
    getImageExtension
};
