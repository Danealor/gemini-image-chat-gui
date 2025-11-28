/**
 * Client-side storage service for communicating with the server API
 */
class ChatStorageService {
    /**
     * Load all chats from server
     * @returns {Promise<Array>} Array of chat objects
     */
    async loadChats() {
        const response = await fetch('/api/chats');
        if (!response.ok) {
            throw new Error(`Failed to load chats: ${response.statusText}`);
        }
        const data = await response.json();
        return data.chats;
    }

    /**
     * Get a single chat by ID
     * @param {string} chatId - Chat ID
     * @returns {Promise<Object>} Chat object
     */
    async getChat(chatId) {
        const response = await fetch(`/api/chats/${chatId}`);
        if (!response.ok) {
            throw new Error(`Failed to load chat: ${response.statusText}`);
        }
        const data = await response.json();
        return data.chat;
    }

    /**
     * Save/update a chat
     * @param {Object} chat - Chat object to save
     * @returns {Promise<Object>} Saved chat object
     */
    async saveChat(chat) {
        const response = await fetch(`/api/chats/${chat.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to save chat: ${error.error || response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Create a new chat
     * @param {Object} chat - New chat object
     * @returns {Promise<Object>} Created chat object
     */
    async createChat(chat) {
        const response = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to create chat: ${error.error || response.statusText}`);
        }
        const data = await response.json();
        return data.chat;
    }

    /**
     * Delete a chat
     * @param {string} chatId - Chat ID to delete
     * @returns {Promise<Object>} Success response
     */
    async deleteChat(chatId) {
        const response = await fetch(`/api/chats/${chatId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to delete chat: ${error.error || response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Upload an image file to the server
     * @param {File} file - Image file to upload
     * @param {string} chatId - Chat ID
     * @param {number} messageIndex - Message index in chat
     * @param {number} imageIndex - Image index in message
     * @returns {Promise<string>} URL of uploaded image
     */
    async uploadImage(file, chatId, messageIndex, imageIndex) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('chatId', chatId);
        formData.append('messageIndex', messageIndex);
        formData.append('imageIndex', imageIndex);

        const response = await fetch('/api/images/upload', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to upload image: ${error.error || response.statusText}`);
        }
        const data = await response.json();
        return data.url;
    }

    /**
     * Save a generated image to the server (from URL or base64)
     * @param {string|null} imageUrl - Image URL (if available)
     * @param {string|null} base64 - Base64 image data (if URL not available)
     * @param {string} chatId - Chat ID
     * @param {number} messageIndex - Message index
     * @param {number} versionIndex - Generation version index
     * @param {number} imageIndex - Image index in generation
     * @returns {Promise<string>} URL of saved image on server
     */
    async saveGeneratedImage(imageUrl, base64, chatId, messageIndex, versionIndex, imageIndex) {
        const response = await fetch('/api/images/save-generated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                base64,
                chatId,
                messageIndex,
                versionIndex,
                imageIndex
            })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Failed to save generated image: ${error.error || response.statusText}`);
        }
        const data = await response.json();
        return data.url;
    }
}
