import { SocialReviewAdapter } from './social-review-base';
import type { SocialCollectOptions, SocialCommentItem } from './social-review-types';

type RequestSource = 'fetch' | 'xhr';

type PatchedXHR = XMLHttpRequest & {
    __odeRequestUrl?: string;
};

export class XiaohongshuReviewAdapter extends SocialReviewAdapter {
    protected readonly platformKey = 'xiaohongshu' as const;
    protected readonly platformLabel = '小红书';
    protected readonly scanLinkSelectors = [
        'a[href*="/explore/"]',
        'a[href*="/discovery/item/"]'
    ];
    protected readonly titleSuffixPattern = /\s*[-|｜]\s*小红书.*$/i;

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
        return url.includes('/api/sns/web/v2/comment/page')
            || url.includes('/api/sns/web/v2/comment/sub/page');
    }

    private parseApiComment(comment: Record<string, any>, parentId: string | null): Partial<SocialCommentItem> | null {
        if (!comment || typeof comment !== 'object') return null;
        const content = this.cleanText(String(comment.content || ''));
        if (!content) return null;

        const userInfo = (comment.user_info || {}) as Record<string, any>;
        const userId = this.cleanText(String(userInfo.user_id || ''));
        const user = this.cleanText(String(userInfo.nickname || '')) || '匿名用户';
        const createTimeRaw = Number(comment.create_time || 0);
        const createdAt = Number.isFinite(createTimeRaw) && createTimeRaw > 0
            ? new Date(createTimeRaw)
            : null;

        let resolvedParentId = parentId;
        if (!resolvedParentId) {
            const targetId = this.cleanText(String(comment.target_comment?.id || ''));
            if (targetId) resolvedParentId = targetId;
        }

        return {
            id: this.cleanText(String(comment.id || '')),
            contentId: this.getCurrentContentId(),
            user,
            userId,
            userLink: userId ? `https://www.xiaohongshu.com/user/profile/${userId}` : '',
            userAvatar: this.cleanText(String(userInfo.image || userInfo.avatar || '')),
            content,
            likes: Number(comment.like_count || 0) || 0,
            time: createdAt ? this.cleanText(createdAt.toLocaleString()) : '',
            ipLocation: this.cleanText(String(comment.ip_location || '')),
            isReply: !!resolvedParentId,
            parentId: resolvedParentId,
            replyCount: Number(comment.sub_comment_count || 0) || 0,
            source: 'api'
        };
    }

    private parseApiPayload(payload: unknown): Array<Partial<SocialCommentItem>> {
        const data = payload as Record<string, any> | null;
        if (!data || !data.data || !Array.isArray(data.data.comments)) return [];

        const parsed: Array<Partial<SocialCommentItem>> = [];

        const traverse = (list: Record<string, any>[], parentId: string | null) => {
            for (const comment of list) {
                const current = this.parseApiComment(comment, parentId);
                if (!current) continue;
                parsed.push(current);

                const nextParent = this.cleanText(String(current.id || '')) || parentId;
                const subComments = Array.isArray(comment.sub_comments) ? comment.sub_comments : [];
                if (subComments.length > 0) {
                    traverse(subComments, nextParent || null);
                }
            }
        };

        traverse(data.data.comments as Record<string, any>[], null);
        return parsed;
    }

    private parseDomComments(): Array<Partial<SocialCommentItem>> {
        const items = Array.from(document.querySelectorAll('.comment-item, .parent-comment-item, .sub-comment-item'));
        const parsed: Array<Partial<SocialCommentItem>> = [];

        for (const item of items) {
            const content = this.cleanText(item.querySelector('.content')?.textContent || '');
            if (!content) continue;

            const nameNode = item.querySelector('.name') as HTMLElement | null;
            const user = this.cleanText(nameNode?.textContent || '') || '匿名用户';
            const userAnchor = nameNode?.closest('a[href]') as HTMLAnchorElement | null;
            const userLink = this.toAbsoluteUrl(userAnchor?.href || userAnchor?.getAttribute('href') || '');
            const userId = userLink.match(/\/user\/profile\/([A-Za-z0-9_-]+)/)?.[1] || '';

            const likes = this.parseCompactNumber(this.cleanText(item.querySelector('.like-count')?.textContent || ''));
            const dateText = this.cleanText(item.querySelector('.date')?.textContent || '');
            let time = dateText;
            let ipLocation = '';
            if (dateText.includes(' ')) {
                const [left, right] = dateText.split(/\s+/, 2);
                time = this.cleanText(left);
                ipLocation = this.cleanText(right);
            }

            const isReply = item.classList.contains('sub-comment-item') || !!item.closest('.sub-comments');
            const id = `${this.platformKey}_dom_${this.shortHash(`${userId}|${content}|${time}`)}`;

            parsed.push({
                id,
                contentId: this.getCurrentContentId(),
                user,
                userId,
                userLink,
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

    private async expandReplies() {
        const buttons = Array.from(document.querySelectorAll(
            '.show-more, .show-more-replies, .expand-replies, [class*="show-more"], [class*="expand"]'
        ));
        let count = 0;
        for (const button of buttons) {
            if (!this.isElementVisible(button)) continue;
            const text = this.cleanText(button.textContent || '');
            if (!text) continue;
            if (!text.includes('展开') && !text.includes('更多') && !text.includes('查看')) continue;
            (button as HTMLElement).click();
            count += 1;
            await this.wait(120);
        }
        return count;
    }

    private findScrollContainer(): HTMLElement | Window {
        const selectors = ['.note-scroller', '#noteContainer', '.interaction-container'];
        for (const selector of selectors) {
            const node = document.querySelector(selector);
            if (!(node instanceof HTMLElement)) continue;
            if (!this.isElementVisible(node)) continue;
            const overflowY = window.getComputedStyle(node).overflowY.toLowerCase();
            if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
                && node.scrollHeight > node.clientHeight + 20) {
                return node;
            }
        }
        return window;
    }

    private async openCommentPanel() {
        const candidates = Array.from(document.querySelectorAll('button, div, span'));
        for (const node of candidates) {
            if (!this.isElementVisible(node)) continue;
            const text = this.cleanText(node.textContent || '');
            if (!text || text.length > 10) continue;
            if (!text.includes('评论')) continue;
            node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            await this.wait(250);
            break;
        }
    }

    private async scrollOnce(container: HTMLElement | Window, waitMs: number) {
        const delayMs = Math.max(260, waitMs);

        if (container === window) {
            const before = window.scrollY;
            window.scrollBy(0, 1000);
            await this.wait(delayMs);
            const after = window.scrollY;
            const reachedBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
            return {
                moved: after > before + 1,
                reachedBottom
            };
        }

        const scrollEl = container as HTMLElement;
        const before = scrollEl.scrollTop;
        const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
        const target = Math.min(maxTop, before + 1000);
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
        if (host === 'xhslink.com') {
            parsed.hash = '';
            return parsed.toString();
        }

        if (!host.includes('xiaohongshu.com')) return null;
        if (!/\/(explore|discovery\/item)\/[A-Za-z0-9_-]+(?:\/)?$/i.test(parsed.pathname)) return null;
        parsed.hash = '';
        return parsed.toString();
    }

    protected isDetailPageUrl(url: URL): boolean {
        const host = url.hostname.toLowerCase();
        if (!host.includes('xiaohongshu.com')) return false;
        return /\/(explore|discovery\/item)\/[A-Za-z0-9_-]+(?:\/)?$/i.test(url.pathname);
    }

    protected extractContentId(url: URL): string {
        const match = url.pathname.match(/\/(explore|discovery\/item)\/([A-Za-z0-9_-]+)(?:\/)?$/i);
        return match?.[2] || '';
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
            this.reportProgress('正在准备小红书评论区...', {
                total: 0,
                round: 0,
                maxRounds: options.maxRounds
            });

            await this.openCommentPanel();
            await this.wait(Math.min(1500, options.scrollWaitMs + 300));

            const scrollContainer = this.findScrollContainer();

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
                    await this.wait(Math.max(120, Math.floor(options.scrollWaitMs * 0.3)));
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
