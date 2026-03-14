import { CONTENT_ACTIONS, CONTENT_PORTS } from '../shared/contracts/content';
import { ExtractionHandler } from './extractionHandler';
import { ScrollScanner } from './scrollScanner';

class App {
    static scrollScanner = new ScrollScanner();

    static init() {
        // Check if context is still valid
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
            console.warn('ContentExtract: Extension context invalidated. Please refresh the page.');
            return;
        }

        console.log('ContentExtract: Content Script Initialized');

        if (chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
                if (request.action === CONTENT_ACTIONS.EXTRACT_CONTENT) {
                    ExtractionHandler.extract(request.format, request.options)
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

                if (request.action === CONTENT_ACTIONS.EXTRACT_AND_DOWNLOAD_LOCAL) {
                    ExtractionHandler.downloadLocally(request.format, request.options)
                        .then(result => sendResponse({ success: true, title: document.title, ...result }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                }

                if (request.action === CONTENT_ACTIONS.EXTRACT_LOCAL_ARCHIVE) {
                    ExtractionHandler.createLocalArchive(request.format, request.options)
                        .then(result => sendResponse({ success: true, title: document.title, ...result }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                }

                if (request.action === CONTENT_ACTIONS.SCAN_LINKS) {
                    ExtractionHandler.scan()
                        .then(links => sendResponse({ success: true, links }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                }

                if (request.action === CONTENT_ACTIONS.STOP_SCROLL_SCAN) {
                    App.scrollScanner.abort();
                    sendResponse({ success: true });
                    return false;
                }
            });
        }
    }
}

// Listen for port connections (scroll scan)
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === CONTENT_PORTS.SCROLL_SCAN) {
        App.scrollScanner.scan(port);
    }
});

// Run init
if (document.readyState === 'complete') {
    App.init();
} else {
    window.addEventListener('load', App.init);
}
