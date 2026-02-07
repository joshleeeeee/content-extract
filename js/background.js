let BATCH_QUEUE = [];
let isProcessing = false;
let processedResults = [];

// Initialize data from storage
chrome.storage.local.get(['batchQueue', 'processedResults', 'isProcessing'], (data) => {
    if (data.batchQueue) BATCH_QUEUE = data.batchQueue;
    if (data.processedResults) processedResults = data.processedResults;
    if (data.isProcessing) {
        // Resume if was processing
        isProcessing = true;
        processNextItem();
    }
});

async function saveState() {
    await chrome.storage.local.set({
        batchQueue: BATCH_QUEUE,
        processedResults,
        isProcessing
    });
}

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // Command: Queue URLs for processing
    if (request.action === 'START_BATCH_PROCESS') {
        const { items, format, options } = request;
        if (!items || !items.length) {
            sendResponse({ success: false, error: 'No Items' });
            return true;
        }

        items.forEach(item => {
            BATCH_QUEUE.push({
                url: item.url,
                title: item.title,
                format,
                options,
                status: 'pending'
            });
        });

        if (!isProcessing) {
            processNextItem();
        }
        saveState();
        sendResponse({ success: true, message: 'Started' });
        return true;
    }

    // Command: Get Status
    if (request.action === 'GET_BATCH_STATUS') {
        sendResponse({
            isProcessing,
            queueLength: BATCH_QUEUE.length,
            results: processedResults
        });
        return true;
    }

    // Command: Clear Results
    if (request.action === 'CLEAR_BATCH_RESULTS') {
        processedResults = [];
        BATCH_QUEUE = []; // clear queue
        isProcessing = false;
        saveState().then(() => sendResponse({ success: true }));
        return true;
    }

    // Command: Delete a specific item from processed results
    if (request.action === 'DELETE_BATCH_ITEM') {
        const { url } = request;
        processedResults = processedResults.filter(item => item.url !== url);
        saveState().then(() => sendResponse({ success: true }));
        return true;
    }

    return true; // async response
});

async function processNextItem() {
    if (BATCH_QUEUE.length === 0) {
        isProcessing = false;
        saveState(); // Save processing state
        // Optionally notify user via notification (if permission granted)
        return;
    }

    isProcessing = true;
    const item = BATCH_QUEUE.shift();
    await saveState(); // Save queue reduction

    let tabId = null;

    console.log('Processing:', item.url);

    try {
        // Open tab (inactive)
        const tab = await chrome.tabs.create({ url: item.url, active: false });
        tabId = tab.id;

        // Wait for page load (simple delay or listen for update)
        // Listening for 'complete' status is better but complex with single listener
        // Let's use polling or a generous delay (Feishu loads slow anyway)
        // Enhanced: Wait for tab update to 'complete'

        await waitForTabLoad(tabId);

        // Wait another 4s for Feishu app to initialize
        await new Promise(r => setTimeout(r, 4000));

        // Execute script (if not already injected by manifest match)
        // With manifest match, content script runs automatically.
        // Send message to extract

        // Retry sending message in case content script is slow
        let response = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await chrome.tabs.sendMessage(tabId, {
                    action: 'EXTRACT_CONTENT',
                    format: item.format || 'markdown',
                    options: item.options || { useBase64: true }
                });
                if (response) break;
            } catch (e) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (response && response.success) {
            // Priority: Explicit H1/Header from content > Scanned title > Tab Title > Fallback
            let title = item.title || 'Untitled';

            if (response.content) {
                if (item.format === 'markdown') {
                    const match = response.content.match(/^#\s+(.*)/);
                    if (match) title = match[1];
                } else {
                    const match = response.content.match(/<h1>(.*?)<\/h1>/);
                    if (match) title = match[1].replace(/<[^>]+>/g, '');
                }
            }

            if (title === 'Untitled' || !title) {
                const updatedTab = await chrome.tabs.get(tabId);
                title = updatedTab.title || 'Doc ' + Date.now();
            }

            processedResults.push({
                url: item.url,
                title: title.trim(),
                content: response.content,
                status: 'success',
                timestamp: Date.now()
            });
        } else {
            throw new Error(response ? response.error : 'Extraction failed or timed out');
        }

    } catch (err) {
        console.error('Batch failed:', item.url, err);
        processedResults.push({
            url: item.url,
            status: 'failed',
            error: err.message,
            timestamp: Date.now()
        });
    } finally {
        if (tabId) {
            try { await chrome.tabs.remove(tabId); } catch (e) { }
        }
        await saveState(); // Save history update
        // Continue to next
        // Add small delay to be nice to server
        setTimeout(processNextItem, 1000);
    }
}

function waitForTabLoad(tabId) {
    return new Promise(async resolve => {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === 'complete') {
                resolve();
                return;
            }
        } catch (e) { resolve(); return; } // tab closed?

        const check = (tId, changeInfo) => {
            if (tId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(check);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(check);
    });
}
