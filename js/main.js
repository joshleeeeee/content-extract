class App {
    static init() {
        console.log('Feishu Copy Extension: Listener Initialized');

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'EXTRACT_CONTENT') {
                App.handleExtraction(request.format, request.options)
                    .then(content => sendResponse({ success: true, content }))
                    .catch(error => sendResponse({ success: false, error: error.message }));

                return true;
            }
            if (request.action === 'SCAN_LINKS') {
                App.handleScan()
                    .then(links => sendResponse({ success: true, links }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
        });
    }

    static async handleScan() {
        try {
            const adapter = PlatformAdapterFactory.getAdapter('markdown', {});
            if (adapter && adapter.scanLinks) {
                return await adapter.scanLinks();
            }
            return [];
        } catch (e) {
            console.error('Scan Error:', e);
            throw e;
        }
    }

    static async handleExtraction(format, options) {
        try {
            const adapter = PlatformAdapterFactory.getAdapter(format, options);
            if (!adapter) {
                // Return generic error or fallback
                // If generic adapter existed, it would be here
                throw new Error('This page is not supported by Feishu Copy Extension.');
            }
            return await adapter.extract();
        } catch (e) {
            console.error('Extraction Error:', e);
            throw e;
        }
    }
}

// Run init
if (document.readyState === 'complete') {
    App.init();
} else {
    window.addEventListener('load', App.init);
}
