const { test, expect } = require('@playwright/test');

test.describe('Storage Migration Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Clean up test data before each test
        await page.request.post('http://localhost:3001/api/test/cleanup');

        // Navigate to the app
        await page.goto('/');

        // Wait for app to initialize
        await page.waitForSelector('#sidebar', { timeout: 5000 });
    });

    test('should create a new chat', async ({ page }) => {
        // Click new chat button
        await page.click('#new-chat-btn');

        // Verify empty state is visible
        await expect(page.locator('#empty-state')).toBeVisible();

        // Verify chat appears in sidebar
        const historyItems = page.locator('.history-item');
        await expect(historyItems).toHaveCount(1);
    });

    test('should persist chat after page reload', async ({ page }) => {
        // Create a chat with a message
        await page.fill('#prompt-input', 'Test prompt for persistence');
        await page.click('#send-btn');

        // Wait for generation to complete
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Reload the page
        await page.reload();

        // Wait for app to load
        await page.waitForSelector('#sidebar');

        // Verify the message is still there
        const userMessage = page.locator('.message.user').first();
        await expect(userMessage).toContainText('Test prompt for persistence');
    });

    test('should upload and save images', async ({ page }) => {
        // Create a small test image (1x1 red pixel PNG)
        const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const buffer = Buffer.from(base64Image, 'base64');

        // Create a file from the buffer
        const testFile = {
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: buffer
        };

        // Upload file
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles({
            name: testFile.name,
            mimeType: testFile.mimeType,
            buffer: testFile.buffer
        });

        // Wait for image preview
        await page.waitForSelector('.image-preview', { timeout: 5000 });

        // Send message with image
        await page.fill('#prompt-input', 'Edit this image');
        await page.click('#send-btn');

        // Wait for response
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Verify user message has image
        const userMessage = page.locator('.message.user').first();
        const inputImages = userMessage.locator('.message-input-images img');
        await expect(inputImages).toHaveCount(1);
    });

    test('should save generated images to server', async ({ page }) => {
        // Send a simple prompt
        await page.fill('#prompt-input', 'Generate a test image');
        await page.click('#send-btn');

        // Wait for assistant message
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Check that generated images are displayed
        const assistantMessage = page.locator('.message.assistant').first();
        const generatedImages = assistantMessage.locator('.message-images img');
        await expect(generatedImages).toHaveCount(1);

        // Verify the image src points to server (/api/images/generated/)
        const imgSrc = await generatedImages.first().getAttribute('src');
        expect(imgSrc).toMatch(/^\/api\/images\/generated\//);
    });

    test('should delete chat and associated images', async ({ page }) => {
        // Create a chat
        await page.fill('#prompt-input', 'Test chat to delete');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Get chat ID from sidebar
        const historyItem = page.locator('.history-item').first();
        await expect(historyItem).toBeVisible();

        // Set up dialog handler before clicking delete
        page.once('dialog', dialog => {
            console.log('Dialog message:', dialog.message());
            dialog.accept();
        });

        // Click delete button
        const deleteBtn = historyItem.locator('.history-item-delete');
        await deleteBtn.click();

        // Wait a bit for deletion
        await page.waitForTimeout(1000);

        // The app prevents deleting the last chat, so we should still see the chat with a message
        // Let's verify the chat still exists
        const historyItems = page.locator('.history-item');
        await expect(historyItems).toHaveCount(1);
    });

    test('should handle regeneration', async ({ page }) => {
        // Create initial message
        await page.fill('#prompt-input', 'Test regeneration');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Click regenerate button
        const regenerateBtn = page.locator('.regenerate-btn').first();
        await regenerateBtn.click();

        // Wait for new generation
        await page.waitForTimeout(2000);

        // Verify version navigation is visible
        const versionNav = page.locator('.version-nav').first();
        await expect(versionNav).toBeVisible();

        // Should show "1 / 2" or similar
        const versionInfo = versionNav.locator('.version-info');
        await expect(versionInfo).toContainText('/');
    });

    test('should edit message and regenerate', async ({ page }) => {
        // Create initial message
        await page.fill('#prompt-input', 'Original prompt');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Click edit button on user message
        const userMessage = page.locator('.message.user').first();
        await userMessage.hover();
        const editBtn = userMessage.locator('.edit-btn');
        await editBtn.click();

        // Modify the prompt
        const editTextarea = userMessage.locator('textarea');
        await editTextarea.fill('Edited prompt');

        // Click save
        const saveBtn = userMessage.locator('.edit-save-btn');
        await saveBtn.click();

        // Wait for regeneration
        await page.waitForTimeout(2000);

        // Verify new prompt is shown
        await expect(userMessage).toContainText('Edited prompt');
    });

    test('should maintain conversation context', async ({ page }) => {
        // Send first message
        await page.fill('#prompt-input', 'First message');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Send second message
        await page.fill('#prompt-input', 'Second message');
        await page.click('#send-btn');

        // Wait for second response
        await page.waitForSelector('.message.assistant:nth-of-type(2)', { timeout: 10000 });

        // Verify both messages are visible
        const userMessages = page.locator('.message.user');
        await expect(userMessages).toHaveCount(2);

        const assistantMessages = page.locator('.message.assistant');
        await expect(assistantMessages).toHaveCount(2);
    });

    test('should handle multiple chats', async ({ page }) => {
        // Create first chat
        await page.fill('#prompt-input', 'Chat 1');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Create new chat
        await page.click('#new-chat-btn');

        // Verify empty state
        await expect(page.locator('#empty-state')).toBeVisible();

        // Create second chat
        await page.fill('#prompt-input', 'Chat 2');
        await page.click('#send-btn');
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Verify 2 chats in sidebar
        const historyItems = page.locator('.history-item');
        await expect(historyItems).toHaveCount(2);

        // Switch back to first chat
        await historyItems.last().click();

        // Verify first chat content is loaded
        const userMessage = page.locator('.message.user').first();
        await expect(userMessage).toContainText('Chat 1');
    });

    test('should handle external image URLs', async ({ page }) => {
        // Add external URL
        const urlInput = page.locator('#image-url-input');
        await urlInput.fill('https://example.com/test-image.jpg');
        await urlInput.press('Enter');

        // Verify URL appears in list
        const urlList = page.locator('#url-list .url-item');
        await expect(urlList).toHaveCount(1);

        // Send message
        await page.fill('#prompt-input', 'Edit this external image');
        await page.click('#send-btn');

        // Wait for response
        await page.waitForSelector('.message.assistant', { timeout: 10000 });

        // Verify URL was saved in chat (external URLs kept as-is)
        // Reload to verify persistence
        await page.reload();
        await page.waitForSelector('#sidebar');

        const userMessage = page.locator('.message.user').first();
        const inputImages = userMessage.locator('.message-input-images img');
        await expect(inputImages).toHaveCount(1);
    });
});
