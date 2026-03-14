import { PlatformAdapterFactory } from './adapters';

export class ScrollScanner {
    private aborted = false;

    abort() {
        this.aborted = true;
    }

    async scan(port: chrome.runtime.Port) {
        this.aborted = false;
        try {
            const adapter = PlatformAdapterFactory.getAdapter('markdown', {});
            if (!adapter || !adapter.scanLinks) {
                console.log('[ScrollScan] No adapter or scanLinks not supported');
                port.postMessage({ type: 'done', links: [] });
                return;
            }

            const container = this.findScrollContainer();
            const scrollHelper = this.createScrollHelper(container);

            // Scroll to top first
            scrollHelper.scrollTo(0);
            await this.delay(500);

            console.log('[ScrollScan] Starting. Container:', container?.tagName, container?.className?.substring(0, 60),
                'scrollHeight:', scrollHelper.getScrollHeight(), 'clientHeight:', scrollHelper.getClientHeight(), 'currentScroll:', scrollHelper.getCurrentScroll());

            const allFoundUrls = new Set<string>();

            // Initial scan before scrolling
            const initialLinks = await adapter.scanLinks();
            initialLinks.forEach(link => allFoundUrls.add(link.url));
            if (initialLinks.length > 0) {
                port.postMessage({ type: 'partial', links: initialLinks });
            }
            console.log(`[ScrollScan] Initial scan found ${initialLinks.length} links`);

            // Start scrolling
            let reachedBottomCount = 0;
            let scrollStuckCount = 0;
            let lastScrollTop = -1;

            while (!this.aborted) {
                const totalHeight = scrollHelper.getScrollHeight();
                const clientHeight = scrollHelper.getClientHeight();
                const currentScroll = scrollHelper.getCurrentScroll();

                console.log(`[ScrollScan] Loop: scroll=${Math.round(currentScroll)}, total=${totalHeight}, client=${clientHeight}, bottom=${Math.round(currentScroll + clientHeight)}`);

                // Scroll down
                const nextScroll = currentScroll + Math.max(clientHeight * 0.7, 300);
                scrollHelper.scrollTo(nextScroll);
                await this.delay(1200);

                if (this.aborted) break;

                // Check actual scroll position after scrolling
                const newScroll = scrollHelper.getCurrentScroll();
                const newTotalHeight = scrollHelper.getScrollHeight();

                // Scan at current position
                const newLinks = await adapter.scanLinks();
                const incrementalLinks = newLinks.filter(link => !allFoundUrls.has(link.url));
                incrementalLinks.forEach(link => allFoundUrls.add(link.url));

                if (incrementalLinks.length > 0) {
                    port.postMessage({ type: 'partial', links: incrementalLinks });
                    // Reset counters when we find new content
                    reachedBottomCount = 0;
                    scrollStuckCount = 0;
                }

                // Check if we've reached the bottom
                if (Math.ceil(newScroll + clientHeight) >= newTotalHeight - 50) {
                    reachedBottomCount++;
                    console.log(`[ScrollScan] Reached bottom (${reachedBottomCount}/3)`);
                    if (reachedBottomCount >= 3) break;
                } else {
                    reachedBottomCount = 0;
                }

                // Check if scroll position stopped changing (stuck)
                if (Math.abs(newScroll - lastScrollTop) < 5 && lastScrollTop !== -1) {
                    scrollStuckCount++;
                    console.log(`[ScrollScan] Scroll stuck (${scrollStuckCount}/3)`);
                    if (scrollStuckCount >= 3) break;
                } else {
                    scrollStuckCount = 0;
                }
                lastScrollTop = newScroll;
            }

            console.log(`[ScrollScan] Done. Total links found: ${allFoundUrls.size}`);
            port.postMessage({ type: 'done', total: allFoundUrls.size });
        } catch (e: any) {
            console.error('Scroll Scan Error:', e);
            port.postMessage({ type: 'error', error: e.message });
        }
    }

    private findScrollContainer(): HTMLElement | null {
        const url = window.location.href;
        const hostname = window.location.hostname;
        const isFeishu = hostname.includes('feishu.cn') || hostname.includes('larksuite.com');
        const isBoss = hostname.includes('zhipin.com');

        // === BOSS 直聘职位列表页 - 使用页面滚动 ===
        if (isBoss && url.includes('/web/geek/job')) {
            console.log('[ScrollScan] Detected BOSS Zhipin job list page - using page scroll');
            return null; // 返回 null 会使用 document.documentElement 滚动
        }

        // === Feishu Drive folder page (/drive/folder/) ===
        if (isFeishu && url.includes('/drive/folder/')) {
            console.log('[ScrollScan] Detected Feishu Drive folder page');

            const driveFolderSelectors = [
                '[class*="folderScrollListWrapper"]',
                '.explorer-file-list-virtualized__container',
                '[class*="VirtualizedList_Scroller"]',
                '.explorer-file-list',
            ];

            for (const selector of driveFolderSelectors) {
                const el = document.querySelector(selector) as HTMLElement;
                if (el && el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                    console.log(`[ScrollScan] Found Drive folder container: ${selector}`, { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
                    return el;
                }
            }

            // Walk up from a file list item to find the scrollable parent
            const fileItem = document.querySelector('.file-list-item, [class*="file-list-item"]');
            if (fileItem) {
                let parent = fileItem.parentElement;
                while (parent && parent !== document.body && parent !== document.documentElement) {
                    const style = window.getComputedStyle(parent);
                    const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');
                    if (isScrollable && parent.scrollHeight > parent.clientHeight && parent.clientHeight > 100) {
                        console.log(`[ScrollScan] Found Drive folder container via file-item walk:`, parent.tagName, parent.className.substring(0, 80), { scrollHeight: parent.scrollHeight, clientHeight: parent.clientHeight });
                        return parent;
                    }
                    parent = parent.parentElement;
                }
            }
            console.log('[ScrollScan] Drive folder: no file list container found, falling through to generic');
        }

        // === Feishu Wiki / Space pages ===
        if (isFeishu && (url.includes('/wiki/') || url.includes('/space/'))) {
            console.log('[ScrollScan] Detected Feishu Wiki/Space page');
            const wikiSelectors = [
                '.catalog-module', '.wiki-tree-container', '.space-main-container',
                '.obj-list-container', '.main-content',
            ];
            for (const selector of wikiSelectors) {
                const el = document.querySelector(selector) as HTMLElement;
                if (el && el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                    console.log(`[ScrollScan] Found Wiki container: ${selector}`, { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
                    return el;
                }
            }
        }

        // === Generic scroll container detection ===
        const candidates = [
            '.scroll-container', '.editor-wrapper', '.render-content', '.document-container',
            '#doc-body', '.ace-content-scroll-container', '.drive-scroll-container',
            '.editor-scroll', '.note-content-container',
        ];

        for (const selector of candidates) {
            const el = document.querySelector(selector) as HTMLElement;
            if (el && el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
                console.log(`[ScrollScan] Found container via selector: ${selector}`, { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
                return el;
            }
        }

        // Try to find a scrollable parent from common page content
        const contentNode = document.querySelector('.workspace-tree-view-node') ||
            document.querySelector('.table-view') ||
            document.querySelector('[data-block-type]') ||
            document.querySelector('.ace-line');

        if (contentNode) {
            let parent = contentNode.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) {
                const style = window.getComputedStyle(parent);
                const isScrollStyle = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');
                if (parent.scrollHeight > parent.clientHeight && parent.clientHeight > 150) {
                    if (isScrollStyle || parent.scrollHeight > parent.clientHeight + 50) {
                        console.log(`[ScrollScan] Found container via parent walk:`, parent.tagName, parent.className.substring(0, 80), { scrollHeight: parent.scrollHeight, clientHeight: parent.clientHeight });
                        return parent;
                    }
                }
                parent = parent.parentElement;
            }
        }

        // Generic fallback: find any scrollable element in the main content area (skip sidebar)
        const mainArea = document.querySelector('[class*="main-content"], [class*="content-area"], main, [role="main"]') as HTMLElement;
        const searchRoot = mainArea || document.body;
        const allElements = Array.from(searchRoot.querySelectorAll('div, main, section, article'));
        for (const el of allElements) {
            const htmlEl = el as HTMLElement;
            const style = window.getComputedStyle(htmlEl);
            const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');
            if (isScrollable && htmlEl.scrollHeight > htmlEl.clientHeight + 200 && htmlEl.clientHeight > 200) {
                console.log(`[ScrollScan] Found container via generic fallback:`, htmlEl.tagName, htmlEl.className.substring(0, 80), { scrollHeight: htmlEl.scrollHeight, clientHeight: htmlEl.clientHeight });
                return htmlEl;
            }
        }

        if (document.body.scrollHeight > document.documentElement.clientHeight &&
            window.getComputedStyle(document.body).overflowY !== 'hidden') {
            console.log('[ScrollScan] Using document.body as container');
            return document.body;
        }

        if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
            console.log('[ScrollScan] Using document.documentElement as container');
            return document.documentElement;
        }

        console.log('[ScrollScan] No scroll container found!');
        return null;
    }

    private createScrollHelper(container: HTMLElement | null) {
        return {
            getScrollHeight: () => container ? container.scrollHeight : document.documentElement.scrollHeight,
            getClientHeight: () => container ? container.clientHeight : document.documentElement.clientHeight,
            scrollTo: (y: number) => {
                if (container) {
                    container.scrollTop = y;
                } else {
                    window.scrollTo(0, y);
                }
            },
            getCurrentScroll: () => container ? container.scrollTop : window.scrollY
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }
}
