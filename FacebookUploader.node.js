const { NodeOperationError } = require('n8n-workflow');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const moment = require('moment');

class FacebookUploader {
    constructor() {
        this.description = {
            displayName: 'Facebook Reels Uploader',
            name: 'facebookUploader',
            icon: 'file:facebook.png',
            group: ['transform'],
            version: 1,
            description: 'Upload Reels video to Facebook dynamically',
            defaults: { name: 'FacebookUploader' },
            inputs: ['main'],
            outputs: ['main'],
            properties: [
                { displayName: 'Asset ID', name: 'asset_id', type: 'string', default: '' },
                { displayName: 'Business ID', name: 'business_id', type: 'string', default: '' },
                { displayName: 'Video File Path', name: 'namafile', type: 'string', default: '' },
                { displayName: 'Caption', name: 'captionvalue', type: 'string', default: '' },
                { displayName: 'File Input Selector', name: 'fileInputSelector', type: 'string', default: '//div[contains(text(),"Add video")]' },
                { displayName: 'Caption Selector', name: 'captionSelector', type: 'string', default: '[aria-label="Describe your reel so that people will know what it\'s about"]' },
                { displayName: 'Thumbnail Selector', name: 'thumbnailSelector', type: 'string', default: '' },
                { displayName: 'Next Button Selector', name: 'buttonNextSelector', type: 'string', default: '(//div[text()="Next"])[2]' },
                { displayName: 'Progress Selector', name: 'progressSelector', type: 'string', default: '//span[text()="100%"]' },
                { displayName: 'Edit Next Selector', name: 'editNextSelector', type: 'string', default: '//div[text()="Next"]' },
                { displayName: 'Share Selector', name: 'shareSelector', type: 'string', default: 'div[role="button"]:has-text("Share") >> nth=2' },
            ],
        };
    }

    async execute() {
        const items = this.getInputData();
        const returnData = [];

        for (let i = 0; i < items.length; i++) {
            const asset_id = this.getNodeParameter('asset_id', i);
            const business_id = this.getNodeParameter('business_id', i);
            const namafile = this.getNodeParameter('namafile', i);
            const captionvalue = this.getNodeParameter('captionvalue', i);

            const fileInputSelector = this.getNodeParameter('fileInputSelector', i);
            const captionSelector = this.getNodeParameter('captionSelector', i);
            const thumbnailSelector = this.getNodeParameter('thumbnailSelector', i);
            const buttonNextSelector = this.getNodeParameter('buttonNextSelector', i);
            const progressSelector = this.getNodeParameter('progressSelector', i);
            const editNextSelector = this.getNodeParameter('editNextSelector', i);
            const shareSelector = this.getNodeParameter('shareSelector', i);

            try {
                console.log(`\n=== Processing item ${i + 1}/${items.length} ===`);
                const result = await uploadReels({
                    asset_id,
                    business_id,
                    namafile,
                    captionvalue,
                    fileInputSelector,
                    captionSelector,
                    thumbnailSelector,
                    buttonNextSelector,
                    progressSelector,
                    editNextSelector,
                    shareSelector,
                });
                returnData.push({ json: result });
            } catch (err) {
                console.error(`ERROR: Failed to upload item ${i + 1} - ${err.message}`);
                returnData.push({ json: { success: false, message: err.message } });
            }
        }

        return this.prepareOutputData(returnData);
    }
}

async function uploadReels(params) {
    const {
        asset_id,
        business_id,
        namafile,
        captionvalue,
        fileInputSelector,
        captionSelector,
        thumbnailSelector,
        buttonNextSelector,
        progressSelector,
        editNextSelector,
        shareSelector,
    } = params;

    function printLog(str) {
        const date = moment().format('HH:mm:ss');
        console.log(`[${date}] ${str}`);
    }

    async function clickUntilVisibleAndClickable(page, selector, maxRetries = 5, delayMs = 3000) {
        if (!selector) return false;
        const button = page.locator(selector);
        let retries = 0;

        while (retries < maxRetries) {
            try {
                await button.waitFor({ state: 'visible', timeout: 5000 });
                try { await button.click({ timeout: 5000 }); } 
                catch { await button.click({ force: true }); }
                printLog(`INFO: Clicked element successfully on attempt ${retries + 1}`);
                return true;
            } catch (err) {
                printLog(`WARN: Element not clickable yet, retrying (${retries + 1}/${maxRetries})`);
                await page.waitForTimeout(delayMs);
                retries++;
            }
        }
        throw new Error('Failed to click the element after maximum retries.');
    }

    async function clickNextUntilProgressFull(page, nextButtonSelector, progressSelector, maxRetries = 60, delayMs = 3000) {
        if (!progressSelector || !nextButtonSelector) return false;
        const nextButton = page.locator(nextButtonSelector);
        const progressEl = page.locator(progressSelector);

        for (let i = 0; i < maxRetries; i++) {
            const progressText = await progressEl.textContent();
            const progressValue = progressText?.trim();
            printLog(`INFO: Current progress = ${progressValue}`);
            if (progressValue === '100%') {
                await page.waitForTimeout(3000);
                await clickUntilVisibleAndClickable(page, nextButtonSelector);
                printLog('INFO: Final click performed.');
                return true;
            }
            await page.waitForTimeout(delayMs);
        }
        throw new Error('Progress did not reach 100% after max retries.');
    }

    async function clickUntilUrlChange(page, selector, maxRetries = 5, delayMs = 10000) {
        const initialUrl = page.url();
        let retries = 0;

        while (retries < maxRetries) {
            const clicked = await clickUntilVisibleAndClickable(page, selector);
            if (!clicked) {
                printLog('ERROR: Failed to click the element.');
                return false;
            }

            await page.waitForTimeout(delayMs);

            if (page.url() !== initialUrl) {
                printLog(`INFO: URL changed to ${page.url()} after ${retries + 1} attempt(s)`);
                return true;
            }

            printLog(`INFO: URL not changed yet, retrying (${retries + 1}/${maxRetries})`);
            retries++;
        }

        printLog('ERROR: URL did not change after maximum retries.');
        return false;
    }

    async function getVisibleLocator(page, selector) {
        if (!selector) return null;
        printLog(`INFO: Waiting for element ${selector} to be visible...`);
        const handle = page.locator(selector);
        await handle.waitFor({ state: 'visible', timeout: 60000 });
        printLog(`INFO: Element ${selector} is now visible.`);
        return handle;
    }

    const userDataDir = path.resolve('/opt/n8n/.n8n/custom/n8n-nodes-facebookuplooader/playwright-user-data');
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        slowMo: 100,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    try {
        const pages = browserContext.pages();
        for (const p of pages.slice(1)) await p.close();
        const page = pages[0] || (await browserContext.newPage());

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.evaluate(() => { document.body.style.zoom = '60%'; });
        page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));

        const url = `https://business.facebook.com/latest/reels_composer/?asset_id=${asset_id}&business_id=${business_id}`;
        printLog(`INFO: Navigating to ${url}`);
        await page.goto(url, { timeout: 60000 });
        await page.waitForLoadState('networkidle');

        // ==== Upload video ====
        if (fileInputSelector) {
            printLog('INFO: Uploading video file...');
            const fileInputHandle = await getVisibleLocator(page, fileInputSelector);
            const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), fileInputHandle.click()]);
            await fileChooser.setFiles(path.resolve(namafile));
            printLog(`INFO: File uploaded: ${namafile}`);
        }

        // ==== Caption ====
        if (captionSelector) {
            printLog('INFO: Typing caption...');
            const captionHandle = await getVisibleLocator(page, captionSelector);
            await captionHandle.click();
            await captionHandle.type(captionvalue);
            printLog(`INFO: Caption entered: ${captionvalue}`);
        }

        // ==== Next + Progress ====
        printLog('INFO: Clicking Next and waiting for progress...');
        await clickNextUntilProgressFull(page, buttonNextSelector, progressSelector);

        // ==== Edit Next ====
        printLog('INFO: Clicking Edit Next...');
        await clickUntilVisibleAndClickable(page, editNextSelector);

        // ==== Share ====
        printLog('INFO: Clicking Share...');
        await clickUntilUrlChange(page, shareSelector);

        printLog('INFO: Upload successful!');

        // ==== Delete file ====
        try { await fs.unlink(namafile); printLog(`INFO: Deleted file ${namafile}`); }
        catch (err) { printLog(`WARN: File not found - ${err.message}`); }

        return { success: true, message: 'Upload successful' };
    } finally {
        printLog('INFO: Closing browser context...');
        await browserContext.close();
    }
}

module.exports = { FacebookUploader };
