let BATCH_QUEUE = [];
let isProcessing = false;
let processedResults = [];
let currentItem = null; // Track what's currently being worked on

let isReady = false;
const preparePromise = new Promise(resolve => {
    chrome.storage.local.get(['batchQueue', 'processedResults', 'isProcessing'], (data) => {
        if (data.batchQueue) BATCH_QUEUE = data.batchQueue;
        if (data.processedResults) processedResults = data.processedResults;
        // Don't restore isProcessing directly as true without a queue
        if (data.isProcessing && BATCH_QUEUE.length > 0) {
            isProcessing = true;
            processNextItem();
        } else {
            isProcessing = false;
        }
        isReady = true;
        resolve();
    });
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
    preparePromise.then(async () => {
        if (request.action === 'START_BATCH_PROCESS') {
            const { items, format, options } = request;
            if (!items || !items.length) {
                sendResponse({ success: false, error: 'No Items' });
                return;
            }

            items.forEach(item => {
                // Deduplicate: Don't add if already in queue or currently processing
                const isInQueue = BATCH_QUEUE.some(q => q.url === item.url);
                const isCurrent = currentItem && currentItem.url === item.url;
                if (!isInQueue && !isCurrent) {
                    BATCH_QUEUE.push({
                        url: item.url,
                        title: item.title,
                        format,
                        options,
                        status: 'pending'
                    });
                }
            });

            if (!isProcessing) {
                processNextItem();
            }
            await saveState();
            sendResponse({ success: true, message: 'Started' });
        } else if (request.action === 'GET_BATCH_STATUS') {
            sendResponse({
                isProcessing,
                queue: BATCH_QUEUE, // Return full queue
                results: processedResults,
                currentItem: currentItem
            });
        } else if (request.action === 'CLEAR_BATCH_RESULTS') {
            processedResults = [];
            BATCH_QUEUE = [];
            isProcessing = false;
            currentItem = null;
            await saveState();
            sendResponse({ success: true });
        } else if (request.action === 'DELETE_BATCH_ITEM') {
            const { url } = request;
            processedResults = processedResults.filter(item => item.url !== url);
            if (currentItem && currentItem.url === url) currentItem = null;
            await saveState();
            sendResponse({ success: true });
        }
    });

    return true;
});

async function processNextItem() {
    if (BATCH_QUEUE.length === 0) {
        isProcessing = false;
        currentItem = null;
        await saveState();
        return;
    }

    isProcessing = true;
    currentItem = BATCH_QUEUE.shift();
    await saveState();

    let tabId = null;
    console.log('Processing:', currentItem.url);

    try {
        const tab = await chrome.tabs.create({ url: currentItem.url, active: false });
        tabId = tab.id;

        await waitForTabLoad(tabId);
        await new Promise(r => setTimeout(r, 4000));

        let response = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await chrome.tabs.sendMessage(tabId, {
                    action: 'EXTRACT_CONTENT',
                    format: currentItem.format || 'markdown',
                    options: currentItem.options || { useBase64: true }
                });
                if (response) break;
            } catch (e) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (response && response.success) {
            let title = currentItem.title || 'Untitled';
            if (response.content) {
                if (currentItem.format === 'markdown') {
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
                url: currentItem.url,
                title: title.trim(),
                content: response.content,
                status: 'success',
                timestamp: Date.now()
            });
        } else {
            throw new Error(response ? response.error : 'Extraction failed or timed out');
        }
    } catch (err) {
        console.error('Batch failed:', currentItem.url, err);
        processedResults.push({
            url: currentItem.url,
            title: currentItem.title || 'Failed Doc',
            status: 'failed',
            error: err.message,
            timestamp: Date.now()
        });
    } finally {
        if (tabId) {
            try { await chrome.tabs.remove(tabId); } catch (e) { }
        }
        currentItem = null;
        await saveState();
        setTimeout(processNextItem, 1000);
    }
}

function waitForTabLoad(tabId) {
    return new Promise(async resolve => {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab && tab.status === 'complete') {
                resolve();
                return;
            }
        } catch (e) { resolve(); return; }

        const check = (tId, changeInfo) => {
            if (tId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(check);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(check);
    });
}
