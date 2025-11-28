class GeminiChat {
    constructor() {
        this.currentChatId = null;
        this.chats = {};
        this.uploadedFiles = [];
        this.uploadedFilesData = []; // Store base64 data for persistence
        this.imageUrls = [];
        this.storageWarningShown = false;

        this.elements = {
            messagesContainer: document.getElementById('messages'),
            emptyState: document.getElementById('empty-state'),
            promptInput: document.getElementById('prompt-input'),
            sendBtn: document.getElementById('send-btn'),
            fileInput: document.getElementById('file-input'),
            imagePreviewContainer: document.getElementById('image-preview-container'),
            imageUrlInput: document.getElementById('image-url-input'),
            urlList: document.getElementById('url-list'),
            modelSelect: document.getElementById('model-select'),
            numImages: document.getElementById('num-images'),
            newChatBtn: document.getElementById('new-chat-btn'),
            historyList: document.getElementById('history-list'),
            sidebar: document.getElementById('sidebar'),
            sidebarToggle: document.getElementById('sidebar-toggle')
        };

        this.init();
    }

    init() {
        // Load chats from localStorage
        this.loadChats();

        // Event listeners
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.elements.imageUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addImageUrl();
            }
        });

        this.elements.newChatBtn.addEventListener('click', () => this.createNewChat());
        this.elements.sidebarToggle.addEventListener('click', () => this.toggleSidebar());

        // Check API health
        this.checkHealth();

        // Render history sidebar
        this.renderHistorySidebar();

        // Create new chat if none exists
        if (!this.currentChatId) {
            this.createNewChat();
        }

        // Check storage usage
        this.checkStorageUsage();
    }

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
    }

    loadChats() {
        try {
            const saved = localStorage.getItem('gemini-chats');
            if (saved) {
                this.chats = JSON.parse(saved);
                // Load the most recent chat
                const chatIds = Object.keys(this.chats).sort((a, b) => b - a);
                if (chatIds.length > 0) {
                    this.currentChatId = chatIds[0];
                }
            }
        } catch (e) {
            console.error('Error loading chats:', e);
            this.chats = {};
        }
    }

    saveChats() {
        try {
            localStorage.setItem('gemini-chats', JSON.stringify(this.chats));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                this.handleStorageQuotaExceeded();
            } else {
                console.error('Error saving chats:', e);
            }
        }
    }

    checkStorageUsage() {
        try {
            const data = localStorage.getItem('gemini-chats') || '';
            const sizeInMB = (data.length * 2) / (1024 * 1024); // Approximate size in MB
            if (sizeInMB > 4) { // Warning at 4MB (localStorage limit is ~5MB)
                this.showStorageWarning(sizeInMB);
            }
        } catch (e) {
            console.error('Error checking storage:', e);
        }
    }

    showStorageWarning(sizeInMB) {
        if (this.storageWarningShown) return;
        this.storageWarningShown = true;

        const warning = document.createElement('div');
        warning.className = 'storage-warning';
        warning.innerHTML = `
            Storage is nearly full (${sizeInMB.toFixed(1)}MB used).
            Consider deleting old chats to free up space.
            <button id="cleanup-storage">Clean Up Old Chats</button>
        `;
        this.elements.messagesContainer.parentElement.insertBefore(warning, this.elements.messagesContainer);

        warning.querySelector('#cleanup-storage').addEventListener('click', () => {
            this.cleanupOldChats();
            warning.remove();
            this.storageWarningShown = false;
        });
    }

    handleStorageQuotaExceeded() {
        const confirmed = confirm(
            'Storage is full! Would you like to automatically remove old chats to make space?\n\n' +
            'This will delete the oldest chats until there\'s enough space.'
        );

        if (confirmed) {
            this.cleanupOldChats();
            // Try saving again
            try {
                localStorage.setItem('gemini-chats', JSON.stringify(this.chats));
            } catch (e) {
                alert('Still not enough space. Please manually delete some chats from the sidebar.');
            }
        } else {
            alert('Could not save. Please delete some old chats manually from the sidebar.');
        }
    }

    cleanupOldChats() {
        const chatIds = Object.keys(this.chats).sort((a, b) => a - b); // Oldest first

        // Keep removing oldest chats until we're under 3MB or only 3 chats left
        while (chatIds.length > 3) {
            const oldestId = chatIds.shift();
            if (oldestId !== this.currentChatId) {
                delete this.chats[oldestId];
            }

            // Check size
            const data = JSON.stringify(this.chats);
            const sizeInMB = (data.length * 2) / (1024 * 1024);
            if (sizeInMB < 3) break;
        }

        this.saveChats();
        this.renderHistorySidebar();
        alert('Old chats have been cleaned up to free storage space.');
    }

    createNewChat() {
        const chatId = Date.now().toString();
        this.chats[chatId] = {
            id: chatId,
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            messages: []
        };
        this.currentChatId = chatId;
        this.saveChats();
        this.renderHistorySidebar();
        this.renderMessages();
        this.clearInputs();

        // Close sidebar on mobile
        this.elements.sidebar.classList.remove('open');
    }

    deleteChat(chatId) {
        delete this.chats[chatId];
        this.saveChats();

        if (this.currentChatId === chatId) {
            const chatIds = Object.keys(this.chats).sort((a, b) => b - a);
            if (chatIds.length > 0) {
                this.currentChatId = chatIds[0];
            } else {
                this.createNewChat();
                return;
            }
        }

        this.renderHistorySidebar();
        this.renderMessages();
        this.checkStorageUsage();
    }

    switchChat(chatId) {
        this.currentChatId = chatId;
        this.renderHistorySidebar();
        this.renderMessages();
        this.clearInputs();

        // Close sidebar on mobile
        this.elements.sidebar.classList.remove('open');
    }

    clearInputs() {
        this.uploadedFiles = [];
        this.uploadedFilesData = [];
        this.imageUrls = [];
        this.elements.imagePreviewContainer.innerHTML = '';
        this.elements.urlList.innerHTML = '';
        this.elements.promptInput.value = '';
    }

    renderHistorySidebar() {
        const chatIds = Object.keys(this.chats).sort((a, b) => b - a);

        // Group by date
        const groups = {};
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        chatIds.forEach(id => {
            const chat = this.chats[id];
            const date = new Date(chat.createdAt).toDateString();

            let groupKey;
            if (date === today) {
                groupKey = 'Today';
            } else if (date === yesterday) {
                groupKey = 'Yesterday';
            } else {
                groupKey = new Date(chat.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(chat);
        });

        let html = '';
        Object.entries(groups).forEach(([date, chats]) => {
            html += `<div class="history-section">
                <div class="history-date">${date}</div>`;

            chats.forEach(chat => {
                const isActive = chat.id === this.currentChatId;
                html += `
                    <div class="history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
                        <span class="history-item-title">${this.escapeHtml(chat.title)}</span>
                        <button class="history-item-delete" data-delete-id="${chat.id}">Delete</button>
                    </div>`;
            });

            html += '</div>';
        });

        this.elements.historyList.innerHTML = html;

        // Add click handlers
        this.elements.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('history-item-delete')) {
                    this.switchChat(item.dataset.chatId);
                }
            });
        });

        this.elements.historyList.querySelectorAll('.history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteChat(btn.dataset.deleteId);
            });
        });
    }

    renderMessages() {
        const chat = this.chats[this.currentChatId];
        if (!chat || chat.messages.length === 0) {
            this.elements.messagesContainer.innerHTML = `
                <div class="empty-state" id="empty-state">
                    <div class="empty-state-icon">&#127912;</div>
                    <h2>Create Amazing Images</h2>
                    <p>Enter a prompt below to generate images, or upload existing images to edit them with AI.</p>
                </div>`;
            return;
        }

        let html = '';
        chat.messages.forEach((msg, index) => {
            html += this.renderMessage(msg, index);
        });

        this.elements.messagesContainer.innerHTML = html;
        this.attachMessageHandlers();
        this.scrollToBottom();
    }

    renderMessage(msg, index) {
        const isUser = msg.role === 'user';
        const avatar = isUser ? 'U' : 'AI';
        const roleName = isUser ? 'You' : 'Gemini';

        let actionsHtml = '';
        if (isUser) {
            // User message actions - removed Regenerate (it's now on the output)
            actionsHtml = `
                <div class="message-actions">
                    <button class="action-btn edit-btn" data-index="${index}">Edit</button>
                    <button class="action-btn add-image-btn" data-index="${index}">Add Image</button>
                    <button class="action-btn copy-btn" data-index="${index}">Copy to New Chat</button>
                </div>`;
        }

        let contentHtml = '';
        if (msg.isEditing) {
            contentHtml = `
                <textarea class="edit-textarea" data-index="${index}">${this.escapeHtml(msg.prompt)}</textarea>
                <div class="edit-actions">
                    <button class="edit-save-btn" data-index="${index}">Save & Regenerate</button>
                    <button class="edit-cancel-btn" data-index="${index}">Cancel</button>
                </div>`;
        } else if (isUser) {
            contentHtml = `<div class="message-content">${this.escapeHtml(msg.prompt)}</div>`;

            // Show input images
            if (msg.inputImages && msg.inputImages.length > 0) {
                contentHtml += '<div class="message-input-images">';
                msg.inputImages.forEach((img, imgIndex) => {
                    contentHtml += `
                        <div class="message-input-image-container">
                            <img src="${img}" alt="Input image" class="message-input-image clickable-image"
                                 data-msg-index="${index}" data-img-index="${imgIndex}" data-image-type="input">
                            <button class="remove-input-image" data-msg-index="${index}" data-img-index="${imgIndex}">&times;</button>
                        </div>`;
                });
                contentHtml += '</div>';
            }
        } else {
            // Assistant message
            if (msg.error) {
                contentHtml = `<div class="error-message"><strong>Error:</strong> ${this.escapeHtml(msg.error)}</div>`;
            } else {
                // Handle multiple generations (versions)
                const generations = msg.generations || [{ images: msg.images }];
                const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                const currentGen = generations[currentVersion];
                const totalVersions = generations.length;

                // Version navigation
                let versionNavHtml = '';
                if (totalVersions > 1 || true) { // Always show to indicate regenerate is possible
                    versionNavHtml = `
                        <div class="version-nav">
                            <button class="version-btn prev-version" data-index="${index}" ${currentVersion === 0 ? 'disabled' : ''}>&#8592;</button>
                            <span class="version-info">${currentVersion + 1} / ${totalVersions}</span>
                            <button class="version-btn next-version" data-index="${index}" ${currentVersion === totalVersions - 1 ? 'disabled' : ''}>&#8594;</button>
                            <button class="action-btn regenerate-btn" data-index="${index}">Regenerate</button>
                        </div>`;
                }

                const images = currentGen?.images || [];
                contentHtml = `<div class="message-content">Generated ${images.length} image(s)</div>`;

                if (images.length > 0) {
                    contentHtml += '<div class="message-images">';
                    images.forEach((imgUrl, imgIndex) => {
                        contentHtml += `<img src="${imgUrl}" alt="Generated image" class="message-image clickable-image"
                                             data-msg-index="${index}" data-img-index="${imgIndex}" data-image-type="generated">`;
                    });
                    contentHtml += '</div>';
                }

                contentHtml += versionNavHtml;
            }
        }

        return `
            <div class="message ${isUser ? 'user' : 'assistant'}" data-index="${index}">
                <div class="message-header">
                    <div class="message-avatar">${avatar}</div>
                    <span class="message-role">${roleName}</span>
                    ${actionsHtml}
                </div>
                <div class="message-body">
                    ${contentHtml}
                </div>
            </div>`;
    }

    attachMessageHandlers() {
        // Edit buttons
        this.elements.messagesContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.startEditing(parseInt(btn.dataset.index)));
        });

        // Add image buttons
        this.elements.messagesContainer.querySelectorAll('.add-image-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showAddImageDialog(parseInt(btn.dataset.index)));
        });

        // Regenerate buttons (now on assistant messages)
        this.elements.messagesContainer.querySelectorAll('.regenerate-btn').forEach(btn => {
            btn.addEventListener('click', () => this.regenerateAtIndex(parseInt(btn.dataset.index)));
        });

        // Copy to new chat buttons
        this.elements.messagesContainer.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => this.copyToNewChat(parseInt(btn.dataset.index)));
        });

        // Edit save/cancel buttons
        this.elements.messagesContainer.querySelectorAll('.edit-save-btn').forEach(btn => {
            btn.addEventListener('click', () => this.saveEdit(parseInt(btn.dataset.index)));
        });

        this.elements.messagesContainer.querySelectorAll('.edit-cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => this.cancelEdit(parseInt(btn.dataset.index)));
        });

        // Remove input image buttons
        this.elements.messagesContainer.querySelectorAll('.remove-input-image').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const msgIndex = parseInt(btn.dataset.msgIndex);
                const imgIndex = parseInt(btn.dataset.imgIndex);
                this.removeInputImage(msgIndex, imgIndex);
            });
        });

        // Version navigation buttons
        this.elements.messagesContainer.querySelectorAll('.prev-version').forEach(btn => {
            btn.addEventListener('click', () => this.changeVersion(parseInt(btn.dataset.index), -1));
        });

        this.elements.messagesContainer.querySelectorAll('.next-version').forEach(btn => {
            btn.addEventListener('click', () => this.changeVersion(parseInt(btn.dataset.index), 1));
        });

        // Image click to open lightbox
        this.elements.messagesContainer.querySelectorAll('.clickable-image').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const msgIndex = parseInt(img.dataset.msgIndex);
                const imgIndex = parseInt(img.dataset.imgIndex);
                const imageType = img.dataset.imageType;
                this.openLightbox(msgIndex, imgIndex, imageType);
            });
        });
    }

    // Lightbox functionality
    openLightbox(msgIndex, imgIndex, imageType) {
        const chat = this.chats[this.currentChatId];
        const msg = chat.messages[msgIndex];

        let images = [];
        let title = '';

        if (imageType === 'input') {
            images = msg.inputImages || [];
            title = 'Input Images';
        } else if (imageType === 'generated') {
            const generations = msg.generations || [{ images: msg.images }];
            const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
            images = generations[currentVersion]?.images || msg.images || [];
            title = `Generated Images (Version ${currentVersion + 1})`;
        }

        if (images.length === 0) return;

        this.showLightbox(images, imgIndex, title, msgIndex, imageType);
    }

    showLightbox(images, currentIndex, title, msgIndex, imageType) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <button class="lightbox-close">&times;</button>
                <button class="lightbox-nav lightbox-prev" ${currentIndex === 0 ? 'disabled' : ''}>&#8592;</button>
                <img src="${images[currentIndex]}" alt="${title}" class="lightbox-image">
                <button class="lightbox-nav lightbox-next" ${currentIndex === images.length - 1 ? 'disabled' : ''}>&#8594;</button>
                <div class="lightbox-info">${title} - ${currentIndex + 1} of ${images.length}</div>
            </div>
        `;

        document.body.appendChild(lightbox);

        const imgEl = lightbox.querySelector('.lightbox-image');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const infoEl = lightbox.querySelector('.lightbox-info');

        let idx = currentIndex;

        const updateImage = () => {
            imgEl.src = images[idx];
            infoEl.textContent = `${title} - ${idx + 1} of ${images.length}`;
            prevBtn.disabled = idx === 0;
            nextBtn.disabled = idx === images.length - 1;
        };

        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (idx > 0) {
                idx--;
                updateImage();
            }
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (idx < images.length - 1) {
                idx++;
                updateImage();
            }
        });

        closeBtn.addEventListener('click', () => lightbox.remove());
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) lightbox.remove();
        });

        // Keyboard navigation
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                lightbox.remove();
                document.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                idx--;
                updateImage();
            } else if (e.key === 'ArrowRight' && idx < images.length - 1) {
                idx++;
                updateImage();
            }
        };
        document.addEventListener('keydown', keyHandler);
    }

    changeVersion(msgIndex, delta) {
        const chat = this.chats[this.currentChatId];
        const msg = chat.messages[msgIndex];

        if (!msg.generations) {
            msg.generations = [{ images: msg.images }];
        }

        const newVersion = (msg.currentVersion || 0) + delta;
        if (newVersion >= 0 && newVersion < msg.generations.length) {
            msg.currentVersion = newVersion;
            this.saveChats();
            this.renderMessages();
        }
    }

    // Regenerate from an assistant message (adds a new version)
    async regenerateAtIndex(assistantMsgIndex) {
        const chat = this.chats[this.currentChatId];

        // Find the corresponding user message (should be the one before)
        const userMsgIndex = assistantMsgIndex - 1;
        if (userMsgIndex < 0 || chat.messages[userMsgIndex].role !== 'user') {
            console.error('Cannot find user message for regeneration');
            return;
        }

        const userMessage = chat.messages[userMsgIndex];
        const assistantMessage = chat.messages[assistantMsgIndex];

        // Initialize generations array if not exists
        if (!assistantMessage.generations) {
            assistantMessage.generations = [{ images: assistantMessage.images }];
        }

        // Generate new version
        await this.generateNewVersion(userMessage, assistantMessage, assistantMsgIndex);
    }

    async generateNewVersion(userMessage, assistantMessage, assistantMsgIndex) {
        // Show loading state
        this.elements.sendBtn.disabled = true;

        try {
            // Build the full conversation context for the API
            const conversationContext = this.buildConversationContext(assistantMsgIndex - 1);

            // Prepare form data
            const formData = new FormData();
            formData.append('prompt', conversationContext.prompt);
            formData.append('model', userMessage.model);
            formData.append('num_images', userMessage.numImages);

            // Add images
            const urls = [];
            const base64Images = [];

            conversationContext.images.forEach(img => {
                if (img.startsWith('data:')) {
                    base64Images.push(img);
                } else {
                    urls.push(img);
                }
            });

            for (const base64 of base64Images) {
                const response = await fetch(base64);
                const blob = await response.blob();
                formData.append('images', blob, 'image.png');
            }

            if (urls.length > 0) {
                formData.append('image_urls', JSON.stringify(urls));
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate image');
            }

            // Extract image URLs
            const images = [];
            if (data.data && data.data.length > 0) {
                data.data.forEach(item => {
                    if (item.url) {
                        images.push(item.url);
                    } else if (item.b64_json) {
                        images.push(`data:image/png;base64,${item.b64_json}`);
                    }
                });
            }

            // Add new generation version
            assistantMessage.generations.push({ images: images, timestamp: new Date().toISOString() });
            assistantMessage.currentVersion = assistantMessage.generations.length - 1;
            assistantMessage.images = images; // Keep for backwards compatibility

            this.saveChats();
            this.renderMessages();

        } catch (error) {
            alert('Error regenerating: ' + error.message);
        } finally {
            this.elements.sendBtn.disabled = false;
        }
    }

    // Build conversation context - all previous prompts + current generation as image
    buildConversationContext(upToUserMsgIndex) {
        const chat = this.chats[this.currentChatId];
        const prompts = [];
        let lastGeneratedImages = [];

        // Collect all user prompts up to and including the target
        for (let i = 0; i <= upToUserMsgIndex; i++) {
            const msg = chat.messages[i];
            if (msg.role === 'user') {
                prompts.push(msg.prompt);
            } else if (msg.role === 'assistant' && !msg.error) {
                // Get the currently displayed version's images
                const generations = msg.generations || [{ images: msg.images }];
                const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                lastGeneratedImages = generations[currentVersion]?.images || msg.images || [];
            }
        }

        // The target user message
        const targetUserMsg = chat.messages[upToUserMsgIndex];

        // Combine prompts with clear delineation
        let combinedPrompt;
        if (prompts.length > 1) {
            combinedPrompt = prompts.map((p, i) => `[Turn ${i + 1}]: ${p}`).join('\n\n');
        } else {
            combinedPrompt = prompts[0];
        }

        // Combine images: user's input images + last generated images
        const allImages = [...(targetUserMsg.inputImages || [])];

        // Add last generated images if this is a continuation
        if (upToUserMsgIndex > 0 && lastGeneratedImages.length > 0) {
            // Include the currently shown generation
            allImages.push(...lastGeneratedImages);
        }

        return {
            prompt: combinedPrompt,
            images: allImages
        };
    }

    startEditing(index) {
        const chat = this.chats[this.currentChatId];
        chat.messages[index].isEditing = true;
        this.renderMessages();

        // Focus the textarea
        const textarea = this.elements.messagesContainer.querySelector(`.edit-textarea[data-index="${index}"]`);
        if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    }

    cancelEdit(index) {
        const chat = this.chats[this.currentChatId];
        chat.messages[index].isEditing = false;
        this.renderMessages();
    }

    async saveEdit(index) {
        const chat = this.chats[this.currentChatId];
        const textarea = this.elements.messagesContainer.querySelector(`.edit-textarea[data-index="${index}"]`);
        const newPrompt = textarea.value.trim();

        if (!newPrompt) return;

        // Update the message
        chat.messages[index].prompt = newPrompt;
        chat.messages[index].isEditing = false;

        // Remove all messages after this one (the response)
        chat.messages = chat.messages.slice(0, index + 1);
        this.saveChats();

        // Regenerate
        await this.generateResponseForUserMessage(index);
    }

    removeInputImage(msgIndex, imgIndex) {
        const chat = this.chats[this.currentChatId];
        chat.messages[msgIndex].inputImages.splice(imgIndex, 1);
        this.saveChats();
        this.renderMessages();
    }

    showAddImageDialog(msgIndex) {
        // Show a modal dialog with options
        const modal = document.createElement('div');
        modal.className = 'add-image-modal';
        modal.innerHTML = `
            <div class="add-image-modal-content">
                <h3>Add Image</h3>
                <div class="add-image-options">
                    <label class="file-upload-btn modal-upload-btn">
                        <input type="file" accept="image/*" multiple style="display: none;">
                        Upload from Computer
                    </label>
                    <div class="url-add-section">
                        <input type="text" placeholder="Or enter image URL" class="modal-url-input">
                        <button class="modal-add-url-btn">Add URL</button>
                    </div>
                </div>
                <button class="modal-close-btn">Close</button>
            </div>
        `;

        document.body.appendChild(modal);

        const fileInput = modal.querySelector('input[type="file"]');
        const urlInput = modal.querySelector('.modal-url-input');
        const addUrlBtn = modal.querySelector('.modal-add-url-btn');
        const closeBtn = modal.querySelector('.modal-close-btn');
        const uploadLabel = modal.querySelector('.modal-upload-btn');

        // Handle click on upload button
        uploadLabel.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            const chat = this.chats[this.currentChatId];
            const message = chat.messages[msgIndex];

            if (!message.inputImages) {
                message.inputImages = [];
            }

            let loadedCount = 0;
            const totalFiles = files.filter(f => f.type.startsWith('image/')).length;

            if (totalFiles === 0) {
                modal.remove();
                return;
            }

            files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        message.inputImages.push(evt.target.result);
                        loadedCount++;

                        if (loadedCount === totalFiles) {
                            this.saveChats();
                            this.renderMessages();
                            modal.remove();
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
        });

        addUrlBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                const chat = this.chats[this.currentChatId];
                const message = chat.messages[msgIndex];

                if (!message.inputImages) {
                    message.inputImages = [];
                }

                message.inputImages.push(url);
                this.saveChats();
                this.renderMessages();
                modal.remove();
            }
        });

        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addUrlBtn.click();
            }
        });

        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    copyToNewChat(msgIndex) {
        const chat = this.chats[this.currentChatId];
        const message = chat.messages[msgIndex];

        // Create new chat
        this.createNewChat();

        // Pre-fill the input
        this.elements.promptInput.value = message.prompt;

        // Pre-fill images
        if (message.inputImages && message.inputImages.length > 0) {
            message.inputImages.forEach((img, i) => {
                if (img.startsWith('data:')) {
                    this.uploadedFilesData.push(img);
                    this.displayImagePreview(img, i);
                } else {
                    this.imageUrls.push(img);
                    this.displayUrlItem(img);
                }
            });
        }

        // Set model and num_images
        if (message.model) this.elements.modelSelect.value = message.model;
        if (message.numImages) this.elements.numImages.value = message.numImages;
    }

    async checkHealth() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();

            if (!data.hasApiKey) {
                this.addErrorToCurrentChat('API key not configured. Please set AIML_API_KEY in .env file');
            }
        } catch (error) {
            this.addErrorToCurrentChat('Failed to connect to server');
        }
    }

    handleFileUpload(event) {
        const files = Array.from(event.target.files);

        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                this.uploadedFiles.push(file);

                // Read as base64 for persistence
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target.result;
                    this.uploadedFilesData.push(base64);
                    this.displayImagePreview(base64, this.uploadedFilesData.length - 1);
                };
                reader.readAsDataURL(file);
            }
        });

        event.target.value = '';
    }

    displayImagePreview(base64, index) {
        const preview = document.createElement('div');
        preview.className = 'image-preview';
        preview.innerHTML = `
            <img src="${base64}" alt="Preview">
            <button class="remove-image" data-index="${index}">&times;</button>
        `;

        preview.querySelector('.remove-image').addEventListener('click', () => {
            this.removeUploadedFile(index);
            preview.remove();
        });

        this.elements.imagePreviewContainer.appendChild(preview);
    }

    removeUploadedFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.uploadedFilesData.splice(index, 1);
        // Re-render previews
        this.elements.imagePreviewContainer.innerHTML = '';
        this.uploadedFilesData.forEach((base64, i) => {
            this.displayImagePreview(base64, i);
        });
    }

    addImageUrl() {
        const url = this.elements.imageUrlInput.value.trim();
        if (url) {
            this.imageUrls.push(url);
            this.displayUrlItem(url);
            this.elements.imageUrlInput.value = '';
        }
    }

    displayUrlItem(url) {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-item';
        urlItem.innerHTML = `
            <span>${url}</span>
            <button data-url="${url}">Remove</button>
        `;

        urlItem.querySelector('button').addEventListener('click', () => {
            this.imageUrls = this.imageUrls.filter(u => u !== url);
            urlItem.remove();
        });

        this.elements.urlList.appendChild(urlItem);
    }

    async sendMessage() {
        const prompt = this.elements.promptInput.value.trim();

        if (!prompt) {
            return;
        }

        const model = this.elements.modelSelect.value;
        const numImages = parseInt(this.elements.numImages.value);

        // Collect all images from input
        const inputImages = [...this.uploadedFilesData, ...this.imageUrls];

        // Create user message
        const userMessage = {
            role: 'user',
            prompt: prompt,
            model: model,
            numImages: numImages,
            inputImages: inputImages,
            timestamp: new Date().toISOString()
        };

        // Add to chat
        const chat = this.chats[this.currentChatId];
        chat.messages.push(userMessage);

        // Update chat title if first user message
        const userMsgCount = chat.messages.filter(m => m.role === 'user').length;
        if (userMsgCount === 1) {
            chat.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
        }

        this.saveChats();
        this.renderHistorySidebar();
        this.renderMessages();

        // Clear inputs
        this.clearInputs();

        // Generate response
        const userMsgIndex = chat.messages.length - 1;
        await this.generateResponseForUserMessage(userMsgIndex);
    }

    async generateResponseForUserMessage(userMsgIndex) {
        const chat = this.chats[this.currentChatId];
        const userMessage = chat.messages[userMsgIndex];

        // Build conversation context
        const context = this.buildConversationContext(userMsgIndex);

        // Show loading
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant';
        loadingDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">AI</div>
                <span class="message-role">Gemini</span>
            </div>
            <div class="message-body">
                <div class="loading">
                    <div class="spinner"></div>
                    <span>Generating image...</span>
                </div>
            </div>`;
        this.elements.messagesContainer.appendChild(loadingDiv);
        this.scrollToBottom();

        // Disable send button
        this.elements.sendBtn.disabled = true;

        try {
            // Prepare form data
            const formData = new FormData();
            formData.append('prompt', context.prompt);
            formData.append('model', userMessage.model);
            formData.append('num_images', userMessage.numImages);

            // Add images - separate base64 from URLs
            const urls = [];
            const base64Images = [];

            context.images.forEach(img => {
                if (img.startsWith('data:')) {
                    base64Images.push(img);
                } else {
                    urls.push(img);
                }
            });

            // For base64 images, we need to convert back to blobs and append as files
            for (const base64 of base64Images) {
                const response = await fetch(base64);
                const blob = await response.blob();
                formData.append('images', blob, 'image.png');
            }

            // Add URLs
            if (urls.length > 0) {
                formData.append('image_urls', JSON.stringify(urls));
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            // Remove loading
            loadingDiv.remove();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate image');
            }

            // Extract image URLs (prefer URLs over base64 to save storage)
            const images = [];
            if (data.data && data.data.length > 0) {
                data.data.forEach(item => {
                    if (item.url) {
                        images.push(item.url);
                    } else if (item.b64_json) {
                        // Only use base64 if no URL available
                        images.push(`data:image/png;base64,${item.b64_json}`);
                    }
                });
            }

            // Add assistant message with generations array
            const assistantMessage = {
                role: 'assistant',
                images: images,
                generations: [{ images: images, timestamp: new Date().toISOString() }],
                currentVersion: 0,
                timestamp: new Date().toISOString()
            };

            chat.messages.push(assistantMessage);
            this.saveChats();
            this.renderMessages();

        } catch (error) {
            loadingDiv.remove();

            const assistantMessage = {
                role: 'assistant',
                error: error.message,
                timestamp: new Date().toISOString()
            };

            chat.messages.push(assistantMessage);
            this.saveChats();
            this.renderMessages();
        } finally {
            this.elements.sendBtn.disabled = false;
        }
    }

    addErrorToCurrentChat(message) {
        const chat = this.chats[this.currentChatId];
        if (chat) {
            chat.messages.push({
                role: 'assistant',
                error: message,
                timestamp: new Date().toISOString()
            });
            this.saveChats();
            this.renderMessages();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }
}

// Initialize the chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GeminiChat();
});
