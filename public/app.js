class GeminiChat {
    constructor() {
        this.currentChatId = null;
        this.chats = {};
        this.uploadedFiles = [];
        this.uploadedFilesData = []; // Store base64 data for persistence
        this.imageUrls = [];
        this.storageService = new ChatStorageService();

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
            sidebarToggle: document.getElementById('sidebar-toggle'),
            // Image context options
            imageContextSection: document.getElementById('image-context-section'),
            ctxLastGenerated: document.getElementById('ctx-last-generated'),
            ctxLastGeneratedAll: document.getElementById('ctx-last-generated-all'),
            ctxLastGeneratedAllContainer: document.getElementById('ctx-last-generated-all-container'),
            ctxPrevGenerated: document.getElementById('ctx-prev-generated'),
            ctxPrevGeneratedAll: document.getElementById('ctx-prev-generated-all'),
            ctxPrevGeneratedAllContainer: document.getElementById('ctx-prev-generated-all-container'),
            ctxFirstUserImages: document.getElementById('ctx-first-user-images'),
            ctxAllUserImages: document.getElementById('ctx-all-user-images'),
            countLastGenerated: document.getElementById('count-last-generated'),
            countLastGeneratedAll: document.getElementById('count-last-generated-all'),
            countPrevGenerated: document.getElementById('count-prev-generated'),
            countPrevGeneratedAll: document.getElementById('count-prev-generated-all'),
            countFirstUser: document.getElementById('count-first-user'),
            countAllUser: document.getElementById('count-all-user'),
            totalImageCount: document.getElementById('total-image-count'),
            totalImageCountContainer: document.querySelector('.total-image-count')
        };

        this.init();
    }

    async init() {
        // Load chats from server
        await this.loadChats();

        // Event listeners
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Drag & drop for images
        this.elements.promptInput.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.promptInput.classList.add('drag-over');
        });

        this.elements.promptInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        this.elements.promptInput.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target === this.elements.promptInput) {
                this.elements.promptInput.classList.remove('drag-over');
            }
        });

        this.elements.promptInput.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.elements.promptInput.classList.remove('drag-over');
            this.handleImageDrop(e.dataTransfer);
        });

        // Paste for images
        this.elements.promptInput.addEventListener('paste', (e) => {
            this.handleImagePaste(e);
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

        // Image context checkbox listeners
        const imageContextCheckboxes = [
            this.elements.ctxLastGenerated,
            this.elements.ctxLastGeneratedAll,
            this.elements.ctxPrevGenerated,
            this.elements.ctxPrevGeneratedAll,
            this.elements.ctxFirstUserImages,
            this.elements.ctxAllUserImages
        ];

        imageContextCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateImageContextCounts());
        });

        // Image context dropdown toggle
        const contextToggle = document.getElementById('context-toggle');
        const contextPanel = document.getElementById('context-options-panel');
        const dropdownArrow = contextToggle?.querySelector('.dropdown-arrow');

        if (contextToggle && contextPanel) {
            contextToggle.addEventListener('click', () => {
                const isOpen = contextPanel.style.display !== 'none';
                contextPanel.style.display = isOpen ? 'none' : 'block';
                if (dropdownArrow) {
                    dropdownArrow.classList.toggle('open', !isOpen);
                }
            });
        }

        // Check API health
        this.checkHealth();

        // Render history sidebar
        this.renderHistorySidebar();

        // Create new chat if none exists, otherwise render current chat
        if (!this.currentChatId) {
            this.createNewChat();
        } else {
            this.renderMessages();
        }
    }

    toggleSidebar() {
        this.elements.sidebar.classList.toggle('open');
    }

    async loadChats() {
        try {
            const chatsArray = await this.storageService.loadChats();

            // Convert array to object keyed by ID
            this.chats = {};
            chatsArray.forEach(chat => {
                this.chats[chat.id] = chat;
            });

            // Load most recent chat
            const chatIds = Object.keys(this.chats).sort((a, b) => b - a);
            if (chatIds.length > 0) {
                this.currentChatId = chatIds[0];
            }
        } catch (e) {
            console.error('Error loading chats:', e);
            this.showNotification('Failed to load chats from server', 'error');
            this.chats = {};
        }
    }

    async saveChats() {
        try {
            if (!this.currentChatId || !this.chats[this.currentChatId]) {
                return;
            }
            await this.storageService.saveChat(this.chats[this.currentChatId]);
        } catch (e) {
            console.error('Error saving chat:', e);
            this.showNotification('Failed to save chat. Please try again.', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    async createNewChat() {
        const chatId = Date.now().toString();
        const newChat = {
            id: chatId,
            title: 'New Chat',
            createdAt: new Date().toISOString(),
            messages: []
        };

        this.chats[chatId] = newChat;
        this.currentChatId = chatId;

        try {
            await this.storageService.createChat(newChat);
        } catch (error) {
            console.error('Error creating chat:', error);
            this.showNotification('Failed to create chat', 'error');
        }

        this.renderHistorySidebar();
        this.renderMessages();
        this.clearInputs();

        // Close sidebar on mobile
        this.elements.sidebar.classList.remove('open');
    }

    async deleteChat(chatId) {
        if (Object.keys(this.chats).length === 1) {
            alert('Cannot delete the last chat.');
            return;
        }

        try {
            await this.storageService.deleteChat(chatId);
            delete this.chats[chatId];

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
        } catch (error) {
            console.error('Error deleting chat:', error);
            this.showNotification('Failed to delete chat', 'error');
        }
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
            this.showImageContextSection();
            return;
        }

        let html = '';
        chat.messages.forEach((msg, index) => {
            html += this.renderMessage(msg, index);
        });

        this.elements.messagesContainer.innerHTML = html;
        this.attachMessageHandlers();
        this.scrollToBottom();
        this.showImageContextSection();
    }

    renderImageContextOptionsForEdit(msg, msgIndex) {
        // Get current options from message or use defaults
        const options = msg.imageContextOptions || {
            includeLastGenerated: true,
            includeLastGeneratedAllVersions: false,
            includePreviousGenerated: false,
            includePreviousGeneratedAllVersions: false,
            includeFirstUserImages: false,
            includeAllUserImages: false
        };

        return `
            <div class="image-context-section edit-context-section" data-edit-index="${msgIndex}" style="margin-top: 12px;">
                <div class="total-image-count edit-context-toggle" data-edit-index="${msgIndex}">
                    <span>Total: <span class="edit-total-count" data-edit-index="${msgIndex}">0</span> / 14 images</span>
                    <span class="dropdown-arrow">▼</span>
                </div>

                <div class="context-options-panel" data-edit-index="${msgIndex}" style="display: none;">
                    <label class="context-option">
                        <input type="checkbox" class="edit-ctx-last-generated" data-edit-index="${msgIndex}" ${options.includeLastGenerated ? 'checked' : ''}>
                        <span>Include last generated image</span>
                        <span class="image-count edit-count-last-generated" data-edit-index="${msgIndex}">0</span>
                    </label>

                    <label class="context-option context-option-sub edit-ctx-last-generated-all-container" data-edit-index="${msgIndex}">
                        <input type="checkbox" class="edit-ctx-last-generated-all" data-edit-index="${msgIndex}" ${options.includeLastGeneratedAllVersions ? 'checked' : ''}>
                        <span>Include ALL versions of last generated</span>
                        <span class="image-count edit-count-last-generated-all" data-edit-index="${msgIndex}">0</span>
                    </label>

                    <label class="context-option">
                        <input type="checkbox" class="edit-ctx-prev-generated" data-edit-index="${msgIndex}" ${options.includePreviousGenerated ? 'checked' : ''}>
                        <span>Include previously generated images</span>
                        <span class="image-count edit-count-prev-generated" data-edit-index="${msgIndex}">0</span>
                    </label>

                    <label class="context-option context-option-sub edit-ctx-prev-generated-all-container" data-edit-index="${msgIndex}">
                        <input type="checkbox" class="edit-ctx-prev-generated-all" data-edit-index="${msgIndex}" ${options.includePreviousGeneratedAllVersions ? 'checked' : ''}>
                        <span>Include ALL versions of previous generated</span>
                        <span class="image-count edit-count-prev-generated-all" data-edit-index="${msgIndex}">0</span>
                    </label>

                    <label class="context-option">
                        <input type="checkbox" class="edit-ctx-first-user-images" data-edit-index="${msgIndex}" ${options.includeFirstUserImages ? 'checked' : ''}>
                        <span>Include images from first user prompt</span>
                        <span class="image-count edit-count-first-user" data-edit-index="${msgIndex}">0</span>
                    </label>

                    <label class="context-option">
                        <input type="checkbox" class="edit-ctx-all-user-images" data-edit-index="${msgIndex}" ${options.includeAllUserImages ? 'checked' : ''}>
                        <span>Include images from all previous user prompts</span>
                        <span class="image-count edit-count-all-user" data-edit-index="${msgIndex}">0</span>
                    </label>
                </div>
            </div>`;
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
                ${this.renderImageContextOptionsForEdit(msg, index)}
                <div class="edit-actions">
                    <button class="edit-save-btn" data-index="${index}">Save & Regenerate</button>
                    <button class="edit-cancel-btn" data-index="${index}">Cancel</button>
                    <div class="edit-note">Note: This will delete all following messages and regenerate</div>
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
                // Handle multiple versions (different prompts)
                this.ensureVersionsStructure(msg);
                const versions = msg.versions;
                const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                const currentVer = versions[currentVersion];
                const totalVersions = versions.length;

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

        if (imageType === 'input') {
            const images = msg.inputImages || [];
            if (images.length === 0) return;
            this.showLightbox(images, imgIndex, 'Input Images', msgIndex, imageType);
        } else if (imageType === 'generated') {
            this.ensureVersionsStructure(msg);
            const versions = msg.versions;
            const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
            this.showGeneratedLightbox(msgIndex, currentVersion, imgIndex, versions);
        }
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

    showGeneratedLightbox(msgIndex, currentVersion, currentImageIndex, versions) {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';

        let versionIdx = currentVersion;
        let imageIdx = currentImageIndex;

        const render = () => {
            const images = versions[versionIdx]?.images || [];
            const totalVersions = versions.length;

            lightbox.innerHTML = `
                <div class="lightbox-content">
                    <button class="lightbox-close">&times;</button>
                    <button class="lightbox-nav lightbox-prev" ${imageIdx === 0 ? 'disabled' : ''}>&#8592;</button>
                    <img src="${images[imageIdx]}" alt="Generated image" class="lightbox-image">
                    <button class="lightbox-nav lightbox-next" ${imageIdx === images.length - 1 ? 'disabled' : ''}>&#8594;</button>
                    <div class="lightbox-info">
                        <div>Image ${imageIdx + 1} of ${images.length}</div>
                        <div class="lightbox-version-nav">
                            <button class="lightbox-version-btn" data-action="prev" ${versionIdx === 0 ? 'disabled' : ''}>&#8592; Prev Version</button>
                            <span>Version ${versionIdx + 1} of ${totalVersions}</span>
                            <button class="lightbox-version-btn" data-action="next" ${versionIdx === totalVersions - 1 ? 'disabled' : ''}>Next Version &#8594;</button>
                        </div>
                    </div>
                </div>
            `;

            // Reattach event listeners after render
            attachListeners();
        };

        const attachListeners = () => {
            const imgEl = lightbox.querySelector('.lightbox-image');
            const prevBtn = lightbox.querySelector('.lightbox-prev');
            const nextBtn = lightbox.querySelector('.lightbox-next');
            const closeBtn = lightbox.querySelector('.lightbox-close');
            const versionBtns = lightbox.querySelectorAll('.lightbox-version-btn');

            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (imageIdx > 0) {
                    imageIdx--;
                    render();
                }
            });

            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const images = versions[versionIdx]?.images || [];
                if (imageIdx < images.length - 1) {
                    imageIdx++;
                    render();
                }
            });

            versionBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    if (action === 'prev' && versionIdx > 0) {
                        versionIdx--;
                        imageIdx = 0; // Reset to first image of new version
                        render();
                    } else if (action === 'next' && versionIdx < versions.length - 1) {
                        versionIdx++;
                        imageIdx = 0; // Reset to first image of new version
                        render();
                    }
                });
            });

            closeBtn.addEventListener('click', () => {
                lightbox.remove();
                document.removeEventListener('keydown', keyHandler);
            });

            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) {
                    lightbox.remove();
                    document.removeEventListener('keydown', keyHandler);
                }
            });
        };

        // Keyboard navigation
        const keyHandler = (e) => {
            const images = versions[versionIdx]?.images || [];
            if (e.key === 'Escape') {
                lightbox.remove();
                document.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'ArrowLeft' && imageIdx > 0) {
                imageIdx--;
                render();
            } else if (e.key === 'ArrowRight' && imageIdx < images.length - 1) {
                imageIdx++;
                render();
            }
        };

        document.body.appendChild(lightbox);
        render();
        document.addEventListener('keydown', keyHandler);
    }

    changeVersion(msgIndex, delta) {
        const chat = this.chats[this.currentChatId];
        const msg = chat.messages[msgIndex];

        this.ensureVersionsStructure(msg);

        const newVersion = (msg.currentVersion || 0) + delta;
        if (newVersion >= 0 && newVersion < msg.versions.length) {
            msg.currentVersion = newVersion;
            this.saveChats();

            // Only update the specific message element instead of re-rendering everything
            const messageElement = this.elements.messagesContainer.querySelector(`.message[data-index="${msgIndex}"]`);
            if (messageElement) {
                // Find the message body and fade it out/in
                const messageBody = messageElement.querySelector('.message-body');
                if (messageBody) {
                    messageBody.style.transition = 'opacity 0.15s ease';
                    messageBody.style.opacity = '0';

                    setTimeout(() => {
                        // Update the content
                        const versions = msg.versions;
                        const currentVer = versions[newVersion];
                        const images = currentVer?.images || [];
                        const totalVersions = versions.length;

                        let contentHtml = `<div class="message-content">Generated ${images.length} image(s)</div>`;

                        if (images.length > 0) {
                            contentHtml += '<div class="message-images">';
                            images.forEach((imgUrl, imgIndex) => {
                                contentHtml += `<img src="${imgUrl}" alt="Generated image" class="message-image clickable-image"
                                                     data-msg-index="${msgIndex}" data-img-index="${imgIndex}" data-image-type="generated">`;
                            });
                            contentHtml += '</div>';
                        }

                        contentHtml += `
                            <div class="version-nav">
                                <button class="version-btn prev-version" data-index="${msgIndex}" ${newVersion === 0 ? 'disabled' : ''}>&#8592;</button>
                                <span class="version-info">${newVersion + 1} / ${totalVersions}</span>
                                <button class="version-btn next-version" data-index="${msgIndex}" ${newVersion === totalVersions - 1 ? 'disabled' : ''}>&#8594;</button>
                                <button class="action-btn regenerate-btn" data-index="${msgIndex}">Regenerate</button>
                            </div>`;

                        messageBody.innerHTML = contentHtml;

                        // Reattach handlers for this message
                        this.attachMessageHandlers();

                        // Fade back in
                        messageBody.style.opacity = '1';
                    }, 150);
                }
            }
        }
    }

    // Regenerate from an assistant message (adds more images to current version)
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

        // Ensure versions structure
        this.ensureVersionsStructure(assistantMessage);

        // Show loading indicator
        const messageElement = this.elements.messagesContainer.querySelector(`.message[data-index="${assistantMsgIndex}"]`);
        if (messageElement) {
            const regenerateBtn = messageElement.querySelector('.regenerate-btn');
            if (regenerateBtn) {
                regenerateBtn.disabled = true;
                regenerateBtn.textContent = 'Regenerating...';
            }
        }

        // Add more images to current version
        await this.addToCurrentVersion(userMessage, assistantMessage, assistantMsgIndex);
    }

    async addToCurrentVersion(userMessage, assistantMessage, assistantMsgIndex) {
        // Show loading state
        this.elements.sendBtn.disabled = true;

        try {
            // Build the full conversation context for the API
            const conversationContext = this.buildConversationContext(assistantMsgIndex - 1);

            // Use current header settings for model and num_images (allows changing settings for regeneration)
            const currentModel = this.elements.modelSelect.value;
            const currentNumImages = parseInt(this.elements.numImages.value);

            // Prepare form data
            const formData = new FormData();
            formData.append('prompt', conversationContext.prompt);
            formData.append('model', currentModel);
            formData.append('num_images', currentNumImages);

            // Add images - separate server paths, base64, and external URLs
            const externalUrls = [];
            const serverImages = [];

            for (const img of conversationContext.images) {
                if (img.startsWith('data:')) {
                    // Base64 - convert to blob
                    const response = await fetch(img);
                    const blob = await response.blob();
                    formData.append('images', blob, 'image.png');
                } else if (img.startsWith('/api/images/')) {
                    // Server-stored image - fetch and send as file
                    serverImages.push(img);
                } else if (img.startsWith('http')) {
                    // External URL - pass through
                    externalUrls.push(img);
                }
            }

            // Fetch server-stored images and add as files
            for (const serverPath of serverImages) {
                const response = await fetch(serverPath);
                const blob = await response.blob();
                formData.append('images', blob, 'image.png');
            }

            // Add external URLs
            if (externalUrls.length > 0) {
                formData.append('image_urls', JSON.stringify(externalUrls));
            }

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate image');
            }

            // Process and save generated images to server
            const generatedImages = [];
            const versionIndex = assistantMessage.currentVersion;
            const currentVersion = assistantMessage.versions[versionIndex];
            const existingImageCount = currentVersion.images?.length || 0;
            const cacheBuster = Date.now(); // Add cache-busting timestamp

            // Handle different API response formats
            const apiImages = data.images || (data.data && data.data.map(d => d.url || d.b64_json)) || [];

            for (let i = 0; i < apiImages.length; i++) {
                const image = apiImages[i];
                const imageIndex = existingImageCount + i; // Append to existing images

                // Check if it's base64 or URL
                if (image.startsWith('data:')) {
                    // Save base64 to server
                    const serverUrl = await this.storageService.saveGeneratedImage(
                        null,
                        image,
                        this.currentChatId,
                        assistantMsgIndex,
                        versionIndex,
                        imageIndex
                    );
                    generatedImages.push(`${serverUrl}?t=${cacheBuster}`);
                } else if (image.startsWith('http')) {
                    // Download URL and save to server
                    const serverUrl = await this.storageService.saveGeneratedImage(
                        image,
                        null,
                        this.currentChatId,
                        assistantMsgIndex,
                        versionIndex,
                        imageIndex
                    );
                    generatedImages.push(`${serverUrl}?t=${cacheBuster}`);
                } else {
                    generatedImages.push(image);
                }
            }

            // Append new images to current version
            currentVersion.images = [...(currentVersion.images || []), ...generatedImages];
            assistantMessage.images = currentVersion.images; // Keep for backwards compatibility

            await this.saveChats();
            this.renderMessages();

        } catch (error) {
            alert('Error regenerating: ' + error.message);
        } finally {
            this.elements.sendBtn.disabled = false;
        }
    }

    // Build conversation context - all previous prompts + images based on options
    buildConversationContext(upToUserMsgIndex, imageContextOptions) {
        const chat = this.chats[this.currentChatId];
        const prompts = [];
        const allImages = [];

        // Get target user message
        const targetUserMsg = chat.messages[upToUserMsgIndex];

        // Use saved options from target message if not provided
        if (!imageContextOptions) {
            imageContextOptions = targetUserMsg.imageContextOptions || {
                includeLastGenerated: true,
                includeLastGeneratedAllVersions: false,
                includePreviousGenerated: false,
                includePreviousGeneratedAllVersions: false,
                includeFirstUserImages: false,
                includeAllUserImages: false
            };
        }

        // ALWAYS include target user message's input images
        allImages.push(...(targetUserMsg.inputImages || []));

        // Collect all user prompts up to and including the target
        for (let i = 0; i <= upToUserMsgIndex; i++) {
            const msg = chat.messages[i];
            if (msg.role === 'user') {
                prompts.push(msg.prompt);
            }
        }

        // Combine prompts with clear delineation
        let combinedPrompt;
        if (prompts.length > 1) {
            combinedPrompt = prompts.map((p, i) => `[Turn ${i + 1}]: ${p}`).join('\n\n');
        } else {
            combinedPrompt = prompts[0];
        }

        // Find last assistant message index
        let lastAssistantIndex = -1;
        for (let i = upToUserMsgIndex - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'assistant' && !chat.messages[i].error) {
                lastAssistantIndex = i;
                break;
            }
        }

        // Process image context options

        // 1. Include last generated images
        if (imageContextOptions.includeLastGenerated && lastAssistantIndex >= 0) {
            const lastMsg = chat.messages[lastAssistantIndex];
            this.ensureVersionsStructure(lastMsg);
            const versions = lastMsg.versions;

            if (imageContextOptions.includeLastGeneratedAllVersions) {
                // All versions of last generated
                versions.forEach(ver => {
                    allImages.push(...(ver.images || []));
                });
            } else {
                // Current version only
                const currentVersion = lastMsg.currentVersion !== undefined ? lastMsg.currentVersion : 0;
                allImages.push(...(versions[currentVersion]?.images || []));
            }
        }

        // 2. Include previous generated images (before last)
        if (imageContextOptions.includePreviousGenerated) {
            for (let i = 0; i < upToUserMsgIndex; i++) {
                const msg = chat.messages[i];
                if (msg.role === 'assistant' && !msg.error && i !== lastAssistantIndex) {
                    this.ensureVersionsStructure(msg);
                    const versions = msg.versions;

                    if (imageContextOptions.includePreviousGeneratedAllVersions) {
                        // All versions
                        versions.forEach(ver => {
                            allImages.push(...(ver.images || []));
                        });
                    } else {
                        // Current version only
                        const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                        allImages.push(...(versions[currentVersion]?.images || []));
                    }
                }
            }
        }

        // 3. Include first user message images
        if (imageContextOptions.includeFirstUserImages) {
            for (let i = 0; i < upToUserMsgIndex; i++) {
                const msg = chat.messages[i];
                if (msg.role === 'user') {
                    allImages.push(...(msg.inputImages || []));
                    break; // Only first user message
                }
            }
        }

        // 4. Include all previous user message images
        if (imageContextOptions.includeAllUserImages) {
            for (let i = 0; i < upToUserMsgIndex; i++) {
                const msg = chat.messages[i];
                if (msg.role === 'user') {
                    allImages.push(...(msg.inputImages || []));
                }
            }
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

        // Set up dropdown toggle for edit context section
        const contextToggle = this.elements.messagesContainer.querySelector(`.edit-context-toggle[data-edit-index="${index}"]`);
        const contextPanel = this.elements.messagesContainer.querySelector(`.context-options-panel[data-edit-index="${index}"]`);
        const dropdownArrow = contextToggle?.querySelector('.dropdown-arrow');

        if (contextToggle && contextPanel) {
            contextToggle.addEventListener('click', () => {
                const isOpen = contextPanel.style.display !== 'none';
                contextPanel.style.display = isOpen ? 'none' : 'block';
                if (dropdownArrow) {
                    dropdownArrow.classList.toggle('open', !isOpen);
                }
            });
        }

        // Calculate and update image counts for edit mode
        this.updateEditImageContextCounts(index);

        // Add event listeners to checkboxes to recalculate counts
        const checkboxes = this.elements.messagesContainer.querySelectorAll(`.edit-context-section[data-edit-index="${index}"] input[type="checkbox"]`);
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateEditImageContextCounts(index));
        });
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

        // Validate image count
        const totalImageCount = this.updateEditImageContextCounts(index);
        if (totalImageCount > 14) {
            this.showNotification('Too many images selected. Maximum is 14 images.', 'error');
            return;
        }

        // Get image context options from edit mode
        const imageContextOptions = this.getEditImageContextOptions(index);

        // Update the message
        chat.messages[index].prompt = newPrompt;
        chat.messages[index].imageContextOptions = imageContextOptions;
        chat.messages[index].isEditing = false;

        // Check if there's an assistant response after this message
        const hasAssistantResponse = index + 1 < chat.messages.length && chat.messages[index + 1].role === 'assistant';

        if (hasAssistantResponse) {
            // Ensure versions structure on assistant message
            const assistantMessage = chat.messages[index + 1];
            this.ensureVersionsStructure(assistantMessage);

            // Create a new version for the edited prompt (keep old versions)
            assistantMessage.currentVersion = assistantMessage.versions.length;
            assistantMessage.versions.push({ images: [] });
        }

        // Save and render immediately to close edit mode
        await this.saveChats();
        this.renderMessages();

        // Generate new version with new prompt
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

        // Handle click on upload button - no preventDefault needed, let label work naturally
        uploadLabel.addEventListener('click', () => {
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
                    this.updateImageContextCounts(); // Update counts when image added
                };
                reader.readAsDataURL(file);
            }
        });

        event.target.value = '';
    }

    handleImageDrop(dataTransfer) {
        const files = Array.from(dataTransfer.files).filter(f => f.type.startsWith('image/'));

        if (files.length === 0) {
            // Check if there are URLs being dragged
            const url = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                this.imageUrls.push(url);
                this.displayUrlItem(url);
                this.updateImageContextCounts();
                this.showNotification(`Added image URL from drop`, 'success');
            }
            return;
        }

        files.forEach(file => {
            this.uploadedFiles.push(file);

            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                this.uploadedFilesData.push(base64);
                this.displayImagePreview(base64, this.uploadedFilesData.length - 1);
                this.updateImageContextCounts();
            };
            reader.readAsDataURL(file);
        });

        this.showNotification(`Added ${files.length} image${files.length > 1 ? 's' : ''} from drop`, 'success');
    }

    handleImagePaste(event) {
        const items = event.clipboardData?.items;
        if (!items) return;

        let foundImage = false;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Handle pasted images
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                foundImage = true;

                const file = item.getAsFile();
                if (file) {
                    this.uploadedFiles.push(file);

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const base64 = e.target.result;
                        this.uploadedFilesData.push(base64);
                        this.displayImagePreview(base64, this.uploadedFilesData.length - 1);
                        this.updateImageContextCounts();
                    };
                    reader.readAsDataURL(file);
                }
            }
            // Handle pasted URLs
            else if (item.type === 'text/plain' && !foundImage) {
                item.getAsString((text) => {
                    // Only treat as image URL if it looks like an image URL
                    if (text.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
                        event.preventDefault();
                        this.imageUrls.push(text);
                        this.displayUrlItem(text);
                        this.updateImageContextCounts();
                        this.showNotification('Added image URL from paste', 'success');
                    }
                });
            }
        }

        if (foundImage) {
            this.showNotification('Added image from paste', 'success');
        }
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
        this.updateImageContextCounts(); // Update counts when image removed
    }

    addImageUrl() {
        const url = this.elements.imageUrlInput.value.trim();
        if (url) {
            this.imageUrls.push(url);
            this.displayUrlItem(url);
            this.elements.imageUrlInput.value = '';
            this.updateImageContextCounts(); // Update counts when URL added
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
            this.updateImageContextCounts(); // Update counts when URL removed
        });

        this.elements.urlList.appendChild(urlItem);
    }

    async sendMessage() {
        const prompt = this.elements.promptInput.value.trim();

        if (!prompt) {
            return;
        }

        // Validate image count
        const totalImageCount = this.updateImageContextCounts();
        if (totalImageCount > 14) {
            this.showNotification('Too many images selected. Maximum is 14 images.', 'error');
            return;
        }

        // Show loading state
        this.elements.sendBtn.disabled = true;
        this.elements.sendBtn.textContent = 'Uploading images...';

        try {
            const model = this.elements.modelSelect.value;
            const numImages = parseInt(this.elements.numImages.value);

            // Get image context options
            const imageContextOptions = this.getImageContextOptions();

            // Upload base64 images to server first
            const inputImages = [];
            const messageIndex = this.chats[this.currentChatId].messages.length;
            const cacheBuster = Date.now(); // Add cache-busting timestamp

            // Process uploaded files (base64)
            for (let i = 0; i < this.uploadedFilesData.length; i++) {
                const base64Data = this.uploadedFilesData[i];

                // Convert base64 to blob
                const response = await fetch(base64Data);
                const blob = await response.blob();
                const file = new File([blob], `image_${i}.png`, { type: blob.type });

                // Upload to server
                const serverUrl = await this.storageService.uploadImage(
                    file,
                    this.currentChatId,
                    messageIndex,
                    i
                );
                inputImages.push(`${serverUrl}?t=${cacheBuster}`);
            }

            // Add external URLs as-is
            inputImages.push(...this.imageUrls);

            // Create user message
            const userMessage = {
                role: 'user',
                prompt: prompt,
                model: model,
                numImages: numImages,
                inputImages: inputImages,
                imageContextOptions: imageContextOptions,
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

            await this.saveChats();
            this.renderHistorySidebar();
            this.renderMessages();

            // Clear inputs
            this.clearInputs();

            // Update button text
            this.elements.sendBtn.textContent = 'Generating...';

            // Generate response
            const userMsgIndex = chat.messages.length - 1;
            await this.generateResponseForUserMessage(userMsgIndex);
        } catch (error) {
            console.error('Error sending message:', error);
            this.showNotification('Failed to send message', 'error');
        } finally {
            this.elements.sendBtn.disabled = false;
            this.elements.sendBtn.textContent = 'Generate';
        }
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
            // Use current header settings for model and num_images (allows changing settings for regeneration)
            const currentModel = this.elements.modelSelect.value;
            const currentNumImages = parseInt(this.elements.numImages.value);

            // Prepare form data
            const formData = new FormData();
            formData.append('prompt', context.prompt);
            formData.append('model', currentModel);
            formData.append('num_images', currentNumImages);

            // Add images - separate server paths, base64, and external URLs
            const externalUrls = [];
            const serverImages = [];

            for (const img of context.images) {
                if (img.startsWith('data:')) {
                    // Base64 - convert to blob
                    const response = await fetch(img);
                    const blob = await response.blob();
                    formData.append('images', blob, 'image.png');
                } else if (img.startsWith('/api/images/')) {
                    // Server-stored image - fetch and send as file
                    serverImages.push(img);
                } else if (img.startsWith('http')) {
                    // External URL - pass through
                    externalUrls.push(img);
                }
            }

            // Fetch server-stored images and add as files
            for (const serverPath of serverImages) {
                const response = await fetch(serverPath);
                const blob = await response.blob();
                formData.append('images', blob, 'image.png');
            }

            // Add external URLs
            if (externalUrls.length > 0) {
                formData.append('image_urls', JSON.stringify(externalUrls));
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

            // Process and save generated images to server
            const generatedImages = [];
            const messageIndex = chat.messages.length;
            const versionIndex = 0;
            const cacheBuster = Date.now(); // Add cache-busting timestamp

            // Handle different API response formats
            const apiImages = data.images || (data.data && data.data.map(d => d.url || d.b64_json)) || [];

            for (let i = 0; i < apiImages.length; i++) {
                const image = apiImages[i];

                // Check if it's base64 or URL
                if (image.startsWith('data:')) {
                    // Save base64 to server
                    const serverUrl = await this.storageService.saveGeneratedImage(
                        null,
                        image,
                        this.currentChatId,
                        messageIndex,
                        versionIndex,
                        i
                    );
                    generatedImages.push(`${serverUrl}?t=${cacheBuster}`);
                } else if (image.startsWith('http')) {
                    // Download URL and save to server
                    const serverUrl = await this.storageService.saveGeneratedImage(
                        image,
                        null,
                        this.currentChatId,
                        messageIndex,
                        versionIndex,
                        i
                    );
                    generatedImages.push(`${serverUrl}?t=${cacheBuster}`);
                } else {
                    // Keep as-is if it doesn't match expected formats
                    generatedImages.push(image);
                }
            }

            // Add assistant message with versions array
            const assistantMessage = {
                role: 'assistant',
                images: generatedImages,
                versions: [{ images: generatedImages }],
                currentVersion: 0,
                timestamp: new Date().toISOString()
            };

            chat.messages.push(assistantMessage);
            await this.saveChats();
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

    // Image Context Methods

    updateImageContextCounts() {
        const chat = this.chats[this.currentChatId];
        if (!chat) return 0;

        const messages = chat.messages;

        // Current message images (always included)
        const currentImageCount = this.uploadedFilesData.length + this.imageUrls.length;

        // Find last assistant message
        let lastAssistantIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant' && !messages[i].error) {
                lastAssistantIndex = i;
                break;
            }
        }

        // Count last generated images (current version)
        let lastGeneratedCount = 0;
        let lastGeneratedAllCount = 0;
        if (lastAssistantIndex >= 0) {
            const lastMsg = messages[lastAssistantIndex];
            this.ensureVersionsStructure(lastMsg);
            const versions = lastMsg.versions;
            const currentVersion = lastMsg.currentVersion !== undefined ? lastMsg.currentVersion : 0;
            lastGeneratedCount = versions[currentVersion]?.images?.length || 0;

            // All versions
            lastGeneratedAllCount = versions.reduce((sum, ver) => sum + (ver.images?.length || 0), 0);
        }

        // Count previous generated images (before last)
        let prevGeneratedCount = 0;
        let prevGeneratedAllCount = 0;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'assistant' && !messages[i].error && i !== lastAssistantIndex) {
                const msg = messages[i];
                this.ensureVersionsStructure(msg);
                const msgVersions = msg.versions;
                const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                prevGeneratedCount += msgVersions[currentVersion]?.images?.length || 0;

                // All versions
                prevGeneratedAllCount += msgVersions.reduce((sum, ver) => sum + (ver.images?.length || 0), 0);
            }
        }

        // Count first user message images
        let firstUserCount = 0;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'user') {
                firstUserCount = messages[i].inputImages?.length || 0;
                break;
            }
        }

        // Count all previous user message images (excluding current)
        let allUserCount = 0;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'user') {
                allUserCount += messages[i].inputImages?.length || 0;
            }
        }

        // Update UI counts
        this.elements.countLastGenerated.textContent = lastGeneratedCount;
        this.elements.countLastGeneratedAll.textContent = lastGeneratedAllCount;
        this.elements.countPrevGenerated.textContent = prevGeneratedCount;
        this.elements.countPrevGeneratedAll.textContent = prevGeneratedAllCount;
        this.elements.countFirstUser.textContent = firstUserCount;
        this.elements.countAllUser.textContent = allUserCount;

        // Handle checkbox dependencies
        const lastGenChecked = this.elements.ctxLastGenerated.checked;
        const prevGenChecked = this.elements.ctxPrevGenerated.checked;

        this.elements.ctxLastGeneratedAll.disabled = !lastGenChecked;
        this.elements.ctxLastGeneratedAllContainer.style.opacity = lastGenChecked ? '1' : '0.5';

        this.elements.ctxPrevGeneratedAll.disabled = !prevGenChecked;
        this.elements.ctxPrevGeneratedAllContainer.style.opacity = prevGenChecked ? '1' : '0.5';

        // Calculate total based on selected options
        let total = currentImageCount;

        if (this.elements.ctxLastGenerated.checked) {
            if (this.elements.ctxLastGeneratedAll.checked) {
                total += lastGeneratedAllCount;
            } else {
                total += lastGeneratedCount;
            }
        }

        if (this.elements.ctxPrevGenerated.checked) {
            if (this.elements.ctxPrevGeneratedAll.checked) {
                total += prevGeneratedAllCount;
            } else {
                total += prevGeneratedCount;
            }
        }

        if (this.elements.ctxFirstUserImages.checked) {
            total += firstUserCount;
        }

        if (this.elements.ctxAllUserImages.checked) {
            total += allUserCount;
        }

        // Update total display
        this.elements.totalImageCount.textContent = total;

        // Apply over-limit styling
        if (total > 14) {
            this.elements.totalImageCountContainer.classList.add('over-limit');
        } else {
            this.elements.totalImageCountContainer.classList.remove('over-limit');
        }

        return total;
    }

    updateEditImageContextCounts(editIndex) {
        const chat = this.chats[this.currentChatId];
        if (!chat) return 0;

        const messages = chat.messages;
        const editMsg = messages[editIndex];

        // Current message images (the message being edited - always included)
        const currentImageCount = editMsg.inputImages?.length || 0;

        // Find last assistant message BEFORE the edit index
        let lastAssistantIndex = -1;
        for (let i = editIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant' && !messages[i].error) {
                lastAssistantIndex = i;
                break;
            }
        }

        // Count last generated images (current version)
        let lastGeneratedCount = 0;
        let lastGeneratedAllCount = 0;
        if (lastAssistantIndex >= 0) {
            const lastMsg = messages[lastAssistantIndex];
            this.ensureVersionsStructure(lastMsg);
            const versions = lastMsg.versions;
            const currentVersion = lastMsg.currentVersion !== undefined ? lastMsg.currentVersion : 0;
            lastGeneratedCount = versions[currentVersion]?.images?.length || 0;

            // All versions
            lastGeneratedAllCount = versions.reduce((sum, ver) => sum + (ver.images?.length || 0), 0);
        }

        // Count previous generated images (before last, up to editIndex)
        let prevGeneratedCount = 0;
        let prevGeneratedAllCount = 0;
        for (let i = 0; i < editIndex; i++) {
            if (messages[i].role === 'assistant' && !messages[i].error && i !== lastAssistantIndex) {
                const msg = messages[i];
                this.ensureVersionsStructure(msg);
                const msgVersions = msg.versions;
                const currentVersion = msg.currentVersion !== undefined ? msg.currentVersion : 0;
                prevGeneratedCount += msgVersions[currentVersion]?.images?.length || 0;

                // All versions
                prevGeneratedAllCount += msgVersions.reduce((sum, ver) => sum + (ver.images?.length || 0), 0);
            }
        }

        // Count first user message images
        let firstUserCount = 0;
        for (let i = 0; i < editIndex; i++) {
            if (messages[i].role === 'user') {
                firstUserCount = messages[i].inputImages?.length || 0;
                break;
            }
        }

        // Count all previous user message images (excluding current being edited)
        let allUserCount = 0;
        for (let i = 0; i < editIndex; i++) {
            if (messages[i].role === 'user') {
                allUserCount += messages[i].inputImages?.length || 0;
            }
        }

        // Get edit mode UI elements
        const countLastGenerated = this.elements.messagesContainer.querySelector(`.edit-count-last-generated[data-edit-index="${editIndex}"]`);
        const countLastGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-count-last-generated-all[data-edit-index="${editIndex}"]`);
        const countPrevGenerated = this.elements.messagesContainer.querySelector(`.edit-count-prev-generated[data-edit-index="${editIndex}"]`);
        const countPrevGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-count-prev-generated-all[data-edit-index="${editIndex}"]`);
        const countFirstUser = this.elements.messagesContainer.querySelector(`.edit-count-first-user[data-edit-index="${editIndex}"]`);
        const countAllUser = this.elements.messagesContainer.querySelector(`.edit-count-all-user[data-edit-index="${editIndex}"]`);
        const totalCount = this.elements.messagesContainer.querySelector(`.edit-total-count[data-edit-index="${editIndex}"]`);
        const totalContainer = this.elements.messagesContainer.querySelector(`.edit-context-toggle[data-edit-index="${editIndex}"]`);

        const ctxLastGenerated = this.elements.messagesContainer.querySelector(`.edit-ctx-last-generated[data-edit-index="${editIndex}"]`);
        const ctxLastGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-ctx-last-generated-all[data-edit-index="${editIndex}"]`);
        const ctxLastGeneratedAllContainer = this.elements.messagesContainer.querySelector(`.edit-ctx-last-generated-all-container[data-edit-index="${editIndex}"]`);
        const ctxPrevGenerated = this.elements.messagesContainer.querySelector(`.edit-ctx-prev-generated[data-edit-index="${editIndex}"]`);
        const ctxPrevGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-ctx-prev-generated-all[data-edit-index="${editIndex}"]`);
        const ctxPrevGeneratedAllContainer = this.elements.messagesContainer.querySelector(`.edit-ctx-prev-generated-all-container[data-edit-index="${editIndex}"]`);
        const ctxFirstUserImages = this.elements.messagesContainer.querySelector(`.edit-ctx-first-user-images[data-edit-index="${editIndex}"]`);
        const ctxAllUserImages = this.elements.messagesContainer.querySelector(`.edit-ctx-all-user-images[data-edit-index="${editIndex}"]`);

        // Update UI counts
        if (countLastGenerated) countLastGenerated.textContent = lastGeneratedCount;
        if (countLastGeneratedAll) countLastGeneratedAll.textContent = lastGeneratedAllCount;
        if (countPrevGenerated) countPrevGenerated.textContent = prevGeneratedCount;
        if (countPrevGeneratedAll) countPrevGeneratedAll.textContent = prevGeneratedAllCount;
        if (countFirstUser) countFirstUser.textContent = firstUserCount;
        if (countAllUser) countAllUser.textContent = allUserCount;

        // Handle checkbox dependencies
        if (ctxLastGenerated && ctxLastGeneratedAll && ctxLastGeneratedAllContainer) {
            const lastGenChecked = ctxLastGenerated.checked;
            ctxLastGeneratedAll.disabled = !lastGenChecked;
            ctxLastGeneratedAllContainer.style.opacity = lastGenChecked ? '1' : '0.5';
        }

        if (ctxPrevGenerated && ctxPrevGeneratedAll && ctxPrevGeneratedAllContainer) {
            const prevGenChecked = ctxPrevGenerated.checked;
            ctxPrevGeneratedAll.disabled = !prevGenChecked;
            ctxPrevGeneratedAllContainer.style.opacity = prevGenChecked ? '1' : '0.5';
        }

        // Calculate total based on selected options
        let total = currentImageCount;

        if (ctxLastGenerated?.checked) {
            if (ctxLastGeneratedAll?.checked) {
                total += lastGeneratedAllCount;
            } else {
                total += lastGeneratedCount;
            }
        }

        if (ctxPrevGenerated?.checked) {
            if (ctxPrevGeneratedAll?.checked) {
                total += prevGeneratedAllCount;
            } else {
                total += prevGeneratedCount;
            }
        }

        if (ctxFirstUserImages?.checked) {
            total += firstUserCount;
        }

        if (ctxAllUserImages?.checked) {
            total += allUserCount;
        }

        // Update total display
        if (totalCount) totalCount.textContent = total;

        // Apply over-limit styling
        if (totalContainer) {
            if (total > 14) {
                totalContainer.classList.add('over-limit');
            } else {
                totalContainer.classList.remove('over-limit');
            }
        }

        return total;
    }

    getImageContextOptions() {
        // Handle dependencies - uncheck child if parent is unchecked
        const includeLastGenerated = this.elements.ctxLastGenerated.checked;
        const includePrevGenerated = this.elements.ctxPrevGenerated.checked;

        return {
            includeLastGenerated: includeLastGenerated,
            includeLastGeneratedAllVersions: includeLastGenerated && this.elements.ctxLastGeneratedAll.checked,
            includePreviousGenerated: includePrevGenerated,
            includePreviousGeneratedAllVersions: includePrevGenerated && this.elements.ctxPrevGeneratedAll.checked,
            includeFirstUserImages: this.elements.ctxFirstUserImages.checked,
            includeAllUserImages: this.elements.ctxAllUserImages.checked
        };
    }

    setImageContextOptions(options) {
        if (!options) {
            // Default options (backward compatibility)
            options = {
                includeLastGenerated: true,
                includeLastGeneratedAllVersions: false,
                includePreviousGenerated: false,
                includePreviousGeneratedAllVersions: false,
                includeFirstUserImages: false,
                includeAllUserImages: false
            };
        }

        this.elements.ctxLastGenerated.checked = options.includeLastGenerated;
        this.elements.ctxLastGeneratedAll.checked = options.includeLastGeneratedAllVersions;
        this.elements.ctxPrevGenerated.checked = options.includePreviousGenerated;
        this.elements.ctxPrevGeneratedAll.checked = options.includePreviousGeneratedAllVersions;
        this.elements.ctxFirstUserImages.checked = options.includeFirstUserImages;
        this.elements.ctxAllUserImages.checked = options.includeAllUserImages;

        // Update counts after setting options
        this.updateImageContextCounts();
    }

    getEditImageContextOptions(editIndex) {
        // Get checkboxes from edit mode UI
        const ctxLastGenerated = this.elements.messagesContainer.querySelector(`.edit-ctx-last-generated[data-edit-index="${editIndex}"]`);
        const ctxLastGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-ctx-last-generated-all[data-edit-index="${editIndex}"]`);
        const ctxPrevGenerated = this.elements.messagesContainer.querySelector(`.edit-ctx-prev-generated[data-edit-index="${editIndex}"]`);
        const ctxPrevGeneratedAll = this.elements.messagesContainer.querySelector(`.edit-ctx-prev-generated-all[data-edit-index="${editIndex}"]`);
        const ctxFirstUserImages = this.elements.messagesContainer.querySelector(`.edit-ctx-first-user-images[data-edit-index="${editIndex}"]`);
        const ctxAllUserImages = this.elements.messagesContainer.querySelector(`.edit-ctx-all-user-images[data-edit-index="${editIndex}"]`);

        // Handle dependencies - uncheck child if parent is unchecked
        const includeLastGenerated = ctxLastGenerated?.checked || false;
        const includePrevGenerated = ctxPrevGenerated?.checked || false;

        return {
            includeLastGenerated: includeLastGenerated,
            includeLastGeneratedAllVersions: includeLastGenerated && (ctxLastGeneratedAll?.checked || false),
            includePreviousGenerated: includePrevGenerated,
            includePreviousGeneratedAllVersions: includePrevGenerated && (ctxPrevGeneratedAll?.checked || false),
            includeFirstUserImages: ctxFirstUserImages?.checked || false,
            includeAllUserImages: ctxAllUserImages?.checked || false
        };
    }

    showImageContextSection() {
        const chat = this.chats[this.currentChatId];
        if (!chat || chat.messages.length === 0) {
            this.elements.imageContextSection.style.display = 'none';
        } else {
            this.elements.imageContextSection.style.display = 'block';
            this.updateImageContextCounts();
        }
    }

    scrollToBottom() {
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }

    // Helper: Ensure backward compatibility by converting old 'generations' to 'versions'
    ensureVersionsStructure(msg) {
        if (msg.role !== 'assistant') return;

        // Convert old generations to versions
        if (msg.generations && !msg.versions) {
            msg.versions = msg.generations;
            delete msg.generations;
        }

        // Initialize versions if not exists
        if (!msg.versions) {
            msg.versions = [{ images: msg.images || [] }];
        }

        // Ensure currentVersion exists
        if (msg.currentVersion === undefined) {
            msg.currentVersion = 0;
        }
    }
}

// Initialize the chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GeminiChat();
});
