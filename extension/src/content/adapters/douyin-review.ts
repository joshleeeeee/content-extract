import { SocialReviewAdapter } from './social-review-base';
import type { SocialCollectOptions, SocialCommentItem } from './social-review-types';

type RequestSource = 'fetch' | 'xhr';

type PatchedXHR = XMLHttpRequest & {
    __odeRequestUrl?: string;
};

export class DouyinReviewAdapter extends SocialReviewAdapter {
    protected readonly platformKey = 'douyin' as const;
    protected readonly platformLabel = '抖音';
    protected readonly scanLinkSelectors = [
        'a[href*="/video/"]',
        'a[href*="modal_id="]'
    ];
    protected readonly titleSuffixPattern = /\s*[-|｜]\s*抖音.*$/i;

    private wait(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private shortHash(input: string) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
    }

    private isElementVisible(el: Element | null): el is HTMLElement {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    private getRequestUrl(input: RequestInfo | URL): string {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.toString();
        if ('url' in input) return String(input.url || '');
        return '';
    }

    private isCommentApiUrl(rawUrl: string) {
        const url = String(rawUrl || '').toLowerCase();
        if (!url) return false;
        return url.includes('/comment/list')
            || url.includes('comment_list')
            || url.includes('/aweme/v1/comment')
            || url.includes('/aweme/v2/comment');
    }

    private parseApiComment(comment: Record<string, any>, isReply = false, parentId: string | null = null): Partial<SocialCommentItem> | null {
        if (!comment || typeof comment !== 'object') return null;

        const user = (comment.user || {}) as Record<string, any>;
        const content = this.cleanText(String(comment.text || comment.content || ''));
        if (!content) return null;

        const secUid = this.cleanText(String(user.sec_uid || user.sec_user_id || ''));
        const uid = this.cleanText(String(user.uid || user.user_id || user.sec_uid || ''));
        const createTimeRaw = Number(comment.create_time || 0);
        const createAt = Number.isFinite(createTimeRaw) && createTimeRaw > 0
            ? new Date(createTimeRaw > 9_999_999_999 ? createTimeRaw : createTimeRaw * 1000)
            : null;

        const commentId = this.cleanText(String(comment.cid || comment.comment_id || comment.id || ''));
        const userName = this.cleanText(String(user.nickname || user.nick_name || user.name || '')) || '匿名用户';

        return {
            id: commentId || `${this.platformKey}_${this.shortHash(`${uid}|${content}|${parentId || ''}`)}`,
            contentId: this.getCurrentContentId(),
            user: userName,
            userId: uid,
            userAvatar: this.cleanText(String(user.avatar_thumb?.url_list?.[0] || user.avatar || '')),
            userLink: secUid ? `https://www.douyin.com/user/${secUid}` : '',
            content,
            likes: Number(comment.digg_count || comment.like_count || comment.likes || 0) || 0,
            time: createAt ? this.cleanText(createAt.toLocaleString()) : this.cleanText(String(comment.time || '')),
            ipLocation: this.cleanText(String(comment.ip_label || comment.location || '')),
            isReply,
            parentId,
            replyCount: Number(comment.reply_comment_total || comment.reply_count || 0) || 0,
            source: 'api'
        };
    }

    private parseApiPayload(payload: unknown): Array<Partial<SocialCommentItem>> {
        const data = payload as Record<string, any> | null;
        if (!data || typeof data !== 'object') return [];

        const comments = Array.isArray(data.comments)
            ? data.comments
            : Array.isArray(data.data?.comments)
                ? data.data.comments
                : Array.isArray(data.comment_list)
                    ? data.comment_list
                    : [];

        const parsed: Array<Partial<SocialCommentItem>> = [];
        for (const raw of comments) {
            const comment = raw as Record<string, any>;
            const main = this.parseApiComment(comment, false, null);
            if (main) parsed.push(main);

            const replyList = Array.isArray(comment.reply_comment)
                ? comment.reply_comment
                : Array.isArray(comment.sub_comments)
                    ? comment.sub_comments
                    : Array.isArray(comment.reply_list)
                        ? comment.reply_list
                        : [];

            const parentId = this.cleanText(String(comment.cid || comment.comment_id || comment.id || '')) || null;
            for (const replyRaw of replyList) {
                const reply = this.parseApiComment(replyRaw as Record<string, any>, true, parentId);
                if (reply) parsed.push(reply);
            }
        }

        return parsed;
    }

    private extractDomUser(item: Element): { user: string; userLink: string; userId: string } {
        let user = '';
        const titleNode = item.querySelector('[data-click-from="title"]');
        if (titleNode) {
            const clone = titleNode.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('.semi-tag, [class*="tag"]').forEach((el) => el.remove());
            user = this.cleanText(clone.textContent);
        }

        if (!user) {
            const infoLink = item.querySelector('.comment-item-info-wrap a') as HTMLAnchorElement | null;
            user = this.cleanText(infoLink?.textContent || '');
        }

        if (!user) {
            const avatarAlt = this.cleanText((item.querySelector('.comment-item-avatar img') as HTMLImageElement | null)?.alt || '');
            user = avatarAlt.replace(/头像$/, '').trim();
        }

        if (!user) user = '匿名用户';

        const linkNode = item.querySelector('.comment-item-info-wrap a[href], .comment-item-avatar a[href]') as HTMLAnchorElement | null;
        const userLink = this.toAbsoluteUrl(linkNode?.href || linkNode?.getAttribute('href') || '');
        const idMatch = userLink.match(/\/user\/([A-Za-z0-9_-]+)/);
        return {
            user,
            userLink,
            userId: idMatch?.[1] || ''
        };
    }

    private extractDomContent(item: Element): string {
        const selectorCandidates = [
            '[data-e2e="comment-item-content"]',
            '.comment-item-content',
            '.comment-item-info-wrap + div',
            '.comment-item-main > div:nth-child(2)'
        ];

        for (const selector of selectorCandidates) {
            const node = item.querySelector(selector);
            const text = this.cleanText(node?.textContent || '');
            if (!text) continue;
            if (/^\d+[分秒时天周月年].*前/.test(text)) continue;
            return text;
        }

        const spans = Array.from(item.querySelectorAll('span'));
        let best = '';
        for (const span of spans) {
            const text = this.cleanText(span.textContent || '');
            if (text.length <= best.length) continue;
            if (text.length <= 5) continue;
            if (/^\d+[分秒时天周月年].*前/.test(text)) continue;
            if (/^[\d.万k]+$/i.test(text)) continue;
            best = text;
        }

        return best;
    }

    private extractDomTimeAndLocation(item: Element): { time: string; ipLocation: string } {
        const spans = Array.from(item.querySelectorAll('span'));
        for (const span of spans) {
            const text = this.cleanText(span.textContent || '');
            if (!text) continue;
            const looksLikeTime = /^\d+[分秒]钟?前/.test(text)
                || /^\d+小时前/.test(text)
                || /^\d+天前/.test(text)
                || /^[昨前]天/.test(text)
                || /^刚刚/.test(text)
                || /^\d{1,2}-\d{1,2}/.test(text)
                || /^\d{4}-\d{1,2}-\d{1,2}/.test(text);
            if (!looksLikeTime) continue;

            if (text.includes('·')) {
                const [time, ipLocation] = text.split('·');
                return {
                    time: this.cleanText(time),
                    ipLocation: this.cleanText(ipLocation)
                };
            }

            return { time: text, ipLocation: '' };
        }
        return { time: '', ipLocation: '' };
    }

    private parseDomComments(): Array<Partial<SocialCommentItem>> {
        const items = Array.from(document.querySelectorAll('[data-e2e="comment-item"]'));
        if (items.length === 0) return [];

        const parsed: Array<Partial<SocialCommentItem>> = [];
        for (const [index, item] of items.entries()) {
            const content = this.extractDomContent(item);
            if (!content) continue;

            const userInfo = this.extractDomUser(item);
            const { time, ipLocation } = this.extractDomTimeAndLocation(item);

            const likeNode = item.querySelector('.comment-item-stats-container p span, [class*="like"] span, [class*="like"]');
            const likes = this.parseCompactNumber(this.cleanText(likeNode?.textContent || ''));

            const isReply = !!item.closest('[data-e2e="comment-reply"], [class*="reply"], [class*="Reply"]');

            const rawId = this.cleanText(
                (item as HTMLElement).dataset?.cid
                || (item as HTMLElement).dataset?.commentId
                || item.getAttribute('data-cid')
                || item.getAttribute('data-comment-id')
                || ''
            );

            const id = rawId || `${this.platformKey}_dom_${this.shortHash(`${userInfo.userId}|${content}|${time}|${index}`)}`;
            parsed.push({
                id,
                contentId: this.getCurrentContentId(),
                user: userInfo.user,
                userId: userInfo.userId,
                userLink: userInfo.userLink,
                content,
                likes,
                time,
                ipLocation,
                isReply,
                parentId: null,
                source: 'dom'
            });
        }

        return parsed;
    }

    private findCommentContainer() {
        const selectors = [
            '[class*="comment-mainContent"]',
            '[class*="CommentListContainer"]',
            '[class*="commentListContainer"]',
            '[class*="comment-list"]',
            '[class*="CommentList"]',
            '[class*="commentList"]',
            '[class*="comment-panel"]',
            '[class*="CommentPanel"]',
            '.comment-container',
            '[data-e2e="comment-list"]'
        ];

        for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (this.isElementVisible(node)) {
                return node;
            }
        }
        return null;
    }

    private findScrollContainer(container: Element | null): HTMLElement | Window {
        if (!container) return window;
        let current: Element | null = container;
        while (current && current !== document.body) {
            if (current instanceof HTMLElement) {
                const style = window.getComputedStyle(current);
                const overflowY = style.overflowY;
                if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                    && current.scrollHeight > current.clientHeight + 20) {
                    return current;
                }
            }
            current = current.parentElement;
        }
        return window;
    }

    private async openCommentPanel() {
        const selectors = [
            'div[data-e2e="feed-comment-icon"]',
            'button[data-e2e="feed-comment-icon"]',
            '[class*="comment"] [role="button"]'
        ];

        for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (!this.isElementVisible(node)) continue;
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await this.wait(900);
            if (this.findCommentContainer()) return;
        }

        const byText = Array.from(document.querySelectorAll('button,span,div'));
        for (const node of byText) {
            if (!this.isElementVisible(node)) continue;
            const text = this.cleanText(node.textContent || '');
            if (!text || text.length > 12) continue;
            if (!text.includes('评论')) continue;
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await this.wait(900);
            if (this.findCommentContainer()) return;
        }
    }

    private async expandReplies() {
        const candidates = Array.from(document.querySelectorAll('span,button,a'));
        const clicked = new Set<string>();
        let count = 0;

        const patterns = [
            /^展开\d+条回复?$/,
            /^查看\d+条回复?$/,
            /^展开\s*\d+\s*条$/,
            /^查看\s*\d+\s*条$/,
            /^还有\d+条回复/,
            /^共\d+条回复.*展开/
        ];

        for (const node of candidates) {
            if (!this.isElementVisible(node)) continue;
            const text = this.cleanText(node.textContent || '');
            if (!text || text.length > 24) continue;

            const directMatch = text === '展开更多'
                || text === '展开回复'
                || text === '展开更多回复'
                || text === '查看更多回复'
                || text === '查看全部回复';
            const patternMatch = patterns.some((pattern) => pattern.test(text));
            if (!directMatch && !patternMatch) continue;

            const rect = node.getBoundingClientRect();
            const key = `${text}|${Math.round(rect.top)}|${Math.round(rect.left)}`;
            if (clicked.has(key)) continue;

            clicked.add(key);
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            count += 1;
            await this.wait(120);
        }

        return count;
    }

    private async scrollOnce(container: HTMLElement | Window, waitMs: number) {
        const delayMs = Math.max(240, waitMs);

        if (container === window) {
            const before = window.scrollY;
            const step = Math.max(360, Math.floor(window.innerHeight * 0.75));
            window.scrollBy(0, step);
            await this.wait(delayMs);
            const after = window.scrollY;
            const reachedBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 16;
            return {
                moved: after > before + 1,
                reachedBottom
            };
        }

        const scrollEl = container as HTMLElement;
        const before = scrollEl.scrollTop;
        const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
        const step = Math.max(260, Math.floor(scrollEl.clientHeight * 0.8));
        const target = Math.min(maxTop, before + step);
        scrollEl.scrollTop = target;
        scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
        await this.wait(delayMs);

        const after = scrollEl.scrollTop;
        return {
            moved: after > before + 1,
            reachedBottom: after + scrollEl.clientHeight >= scrollEl.scrollHeight - 8
        };
    }

    protected normalizeDetailUrl(rawUrl: string): string | null {
        let parsed: URL;
        try {
            parsed = new URL(rawUrl, window.location.origin);
        } catch (_) {
            return null;
        }

        const host = parsed.hostname.toLowerCase();
        if (!host.includes('douyin.com')) return null;

        const videoPathMatch = parsed.pathname.match(/\/video\/(\d+)/i);
        if (videoPathMatch?.[1]) {
            return `https://www.douyin.com/video/${videoPathMatch[1]}`;
        }

        const modalId = this.cleanText(parsed.searchParams.get('modal_id') || '');
        if (/^\d+$/.test(modalId)) {
            return `https://www.douyin.com/video/${modalId}`;
        }

        if (host === 'v.douyin.com') {
            parsed.hash = '';
            return parsed.toString();
        }

        return null;
    }

    protected isDetailPageUrl(url: URL): boolean {
        const host = url.hostname.toLowerCase();
        if (!host.includes('douyin.com')) return false;
        if (/\/video\/\d+(?:\/)?$/i.test(url.pathname)) return true;
        return /^\d+$/.test(this.cleanText(url.searchParams.get('modal_id') || ''));
    }

    protected extractContentId(url: URL): string {
        const pathMatch = url.pathname.match(/\/video\/(\d+)/i);
        if (pathMatch?.[1]) return pathMatch[1];
        const modalId = this.cleanText(url.searchParams.get('modal_id') || '');
        if (/^\d+$/.test(modalId)) return modalId;
        return '';
    }

    protected async collectComments(options: SocialCollectOptions): Promise<SocialCommentItem[]> {
        const comments: SocialCommentItem[] = [];
        const dedup = new Set<string>();

        const ingest = (items: Array<Partial<SocialCommentItem>>) => {
            const added = this.pushUniqueComments(comments, dedup, items, options.includeReplies);
            if (added > 0) {
                this.reportProgress(`评论抓取中：累计 ${comments.length} 条`, {
                    total: comments.length
                });
            }
            return added;
        };

        const originalFetch = window.fetch.bind(window);
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        const processApiPayload = (payload: unknown, source: RequestSource) => {
            const parsed = this.parseApiPayload(payload);
            if (parsed.length === 0) return;
            const added = ingest(parsed);
            if (added > 0) {
                this.reportProgress(`评论抓取中：${source.toUpperCase()}新增 ${added} 条，累计 ${comments.length} 条`, {
                    total: comments.length
                });
            }
        };

        window.fetch = (async (...args: Parameters<typeof fetch>) => {
            const response = await originalFetch(...args);
            const requestUrl = this.getRequestUrl(args[0]);
            if (this.isCommentApiUrl(requestUrl)) {
                void response.clone().json()
                    .then((payload) => processApiPayload(payload, 'fetch'))
                    .catch(() => {
                        // ignore
                    });
            }
            return response;
        }) as typeof window.fetch;

        XMLHttpRequest.prototype.open = function (this: PatchedXHR, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
            this.__odeRequestUrl = typeof url === 'string' ? url : url.toString();
            return (originalXHROpen as any).call(this, method, url, async, username, password);
        } as typeof XMLHttpRequest.prototype.open;

        const adapter = this;
        XMLHttpRequest.prototype.send = function (this: PatchedXHR, body?: Document | XMLHttpRequestBodyInit | null) {
            this.addEventListener('load', function () {
                const xhr = this as PatchedXHR;
                const requestUrl = String(xhr.__odeRequestUrl || '');
                if (!adapter.isCommentApiUrl(requestUrl)) return;
                const responseType = String(xhr.responseType || '');
                if (responseType && responseType !== 'text') return;
                try {
                    const payload = JSON.parse(String(xhr.responseText || '{}'));
                    processApiPayload(payload, 'xhr');
                } catch (_) {
                    // ignore
                }
            });
            return (originalXHRSend as any).call(this, body);
        } as typeof XMLHttpRequest.prototype.send;

        try {
            this.reportProgress('正在打开抖音评论区...', {
                total: 0,
                round: 0,
                maxRounds: options.maxRounds
            });

            await this.openCommentPanel();
            await this.wait(Math.min(1500, options.scrollWaitMs + 300));

            const container = this.findCommentContainer();
            const scrollContainer = this.findScrollContainer(container);

            ingest(this.parseDomComments());
            if (options.maxCount > 0 && comments.length >= options.maxCount) {
                return comments;
            }

            let idleRounds = 0;
            let noMoveRounds = 0;
            let previousCount = comments.length;

            for (let round = 1; round <= options.maxRounds; round++) {
                if (options.maxCount > 0 && comments.length >= options.maxCount) break;

                const expanded = await this.expandReplies();
                if (expanded > 0) {
                    await this.wait(Math.max(120, Math.floor(options.scrollWaitMs * 0.35)));
                }

                const addedFromDom = ingest(this.parseDomComments());
                const currentCount = comments.length;

                if (currentCount === previousCount && addedFromDom === 0) {
                    idleRounds += 1;
                } else {
                    idleRounds = 0;
                    previousCount = currentCount;
                }

                this.reportProgress(`评论抓取中：第 ${round} 轮，新增 ${addedFromDom} 条，累计 ${currentCount} 条`, {
                    total: currentCount,
                    round,
                    added: addedFromDom,
                    maxRounds: options.maxRounds
                });

                const scrollResult = await this.scrollOnce(scrollContainer, options.scrollWaitMs);
                if (!scrollResult.moved) {
                    noMoveRounds += 1;
                } else {
                    noMoveRounds = 0;
                }

                if (scrollResult.reachedBottom && idleRounds >= 2) break;
                if (idleRounds >= options.idleRoundLimit) break;
                if (noMoveRounds >= 4 && idleRounds >= 2) break;
            }

            await this.wait(Math.max(120, Math.floor(options.scrollWaitMs * 0.25)));
            ingest(this.parseDomComments());
            return comments;
        } finally {
            window.fetch = originalFetch as typeof window.fetch;
            XMLHttpRequest.prototype.open = originalXHROpen;
            XMLHttpRequest.prototype.send = originalXHRSend;
        }
    }
}
