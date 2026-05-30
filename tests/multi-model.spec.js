// tests/multi-model.spec.js
// Playwright integration tests for the multi-provider model dropdown and
// capability-driven controls. Runs against the stub test server on port 3001.

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';

test.beforeEach(async ({ request }) => {
    await request.post(`${BASE}/api/test/cleanup`);
});

test('model dropdown is populated from /api/models, grouped by provider', async ({ page }) => {
    await page.goto(BASE);
    // Wait until the dynamic dropdown is populated with all 4 models from the registry.
    await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);

    const optionValues = await page.$$eval('#model-select option', els => els.map(e => e.value));
    expect(optionValues).toContain('gemini-3-pro-image');
    expect(optionValues).toContain('gpt-image-2');

    const groups = await page.$$eval('#model-select optgroup', els => els.map(e => e.label));
    expect(groups).toEqual(expect.arrayContaining(['Google', 'OpenAI']));
});

test('controls switch between Resolution (Gemini) and Size/Quality (OpenAI)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);

    // Gemini model: Resolution visible, Size/Quality hidden.
    await page.selectOption('#model-select', 'gemini-3-pro-image');
    await expect(page.locator('#resolution-group')).toBeVisible();
    await expect(page.locator('#size-group')).toBeHidden();

    // OpenAI model: Size+Quality visible, Resolution hidden.
    await page.selectOption('#model-select', 'gpt-image-2');
    await expect(page.locator('#resolution-group')).toBeHidden();
    await expect(page.locator('#size-group')).toBeVisible();
    await expect(page.locator('#quality-group')).toBeVisible();
});

test('generating with a Gemini model renders an image in the chat', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);
    await page.selectOption('#model-select', 'gemini-3-pro-image');
    await page.fill('#prompt-input', 'a red apple');
    await page.click('#send-btn');
    await expect(page.locator('.messages img').first()).toBeVisible({ timeout: 10000 });
});

test('generating with the OpenAI model renders an image in the chat', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelectorAll('#model-select option').length >= 4);
    await page.selectOption('#model-select', 'gpt-image-2');
    await page.fill('#prompt-input', 'a blue car');
    await page.click('#send-btn');
    await expect(page.locator('.messages img').first()).toBeVisible({ timeout: 10000 });
});
