import { PlatformAdapterFactory } from './adapters';

class App {
    static init() {
        // Check if context is still valid
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
            console.warn('OnlineDocExporter: Extension context invalidated. Please refresh the page.');
            return;
        }

        console.log('OnlineDocExporter: Content Script Initialized');

        if (chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
                if (request.action === 'EXTRACT_CONTENT') {
                    App.handleExtraction(request.format, request.options)
                        .then(result => {
                            if (typeof result === 'object' && result.content) {
                                sendResponse({ success: true, title: document.title, ...result });
                            } else {
                                sendResponse({ success: true, title: document.title, content: result });
                            }
                        })
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

    static async handleExtraction(format: string, options: any) {
        try {
            const adapter = PlatformAdapterFactory.getAdapter(format, options);
            if (!adapter) {
                throw new Error('当前页面不受插件支持。');
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
