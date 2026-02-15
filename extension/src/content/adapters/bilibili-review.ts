import { SocialReviewAdapter } from './social-review-base';
import type { SocialCollectOptions, SocialCommentItem } from './social-review-types';

type RequestSource = 'fetch' | 'xhr';

type PatchedXHR = XMLHttpRequest & {
    __odeRequestUrl?: string;
};

export class BilibiliReviewAdapter extends SocialReviewAdapter {
    protected readonly platformKey = 'bilibili' as const;
    protected readonly platformLabel = 'B站';
    protected readonly scanLinkSelectors = [
        'a[href*="/video/BV"]',
        'a[href*="/video/av"]'
    ];
    protected readonly titleSuffixPattern = /\s*[-|｜]\s*哔哩哔哩.*$/i;

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
        return url.includes('api.bilibili.com/x/v2/reply');
    }

    private parseApiComment(comment: Record<string, any>, isReply: boolean, parentId: string | null): Partial<SocialCommentItem> | null {
        if (!comment || typeof comment !== 'object') return null;

        const message = this.cleanText(String(comment.content?.message || ''));
        if (!message) return null;

        const member = (comment.member || {}) as Record<string, any>;
        const uid = this.cleanText(String(member.mid || ''));
        const user = this.cleanText(String(member.uname || '')) || '匿名用户';
        const userLink = uid ? `https://space.bilibili.com/${uid}` : '';
        const ctime = Number(comment.ctime || 0);
        const createdAt = Number.isFinite(ctime) && ctime > 0 ? new Date(ctime * 1000) : null;

        return {
            id: this.cleanText(String(comment.rpid || comment.id || '')),
            contentId: this.getCurrentContentId(),
            user,
            userId: uid,
            userLink,
            userAvatar: this.cleanText(String(member.avatar || '')),
            content: message,
            likes: Number(comment.like || 0) || 0,
            time: createdAt ? this.cleanText(createdAt.toLocaleString()) : '',
            ipLocation: this.cleanText(String(comment.reply_control?.location || '')).replace(/^IP属地[:：]?/i, ''),
            isReply,
            parentId,
            replyCount: Number(comment.count || comment.rcount || 0) || 0,
            source: 'api'
        };
    }

    private parseApiPayload(payload: unknown): Array<Partial<SocialCommentItem>> {
        const data = payload as Record<string, any> | null;
        if (!data || Number(data.code) !== 0 || !data.data) return [];

        const merged: Record<string, any>[] = [];
        if (Array.isArray(data.data.replies)) merged.push(...data.data.replies);
        if (Array.isArray(data.data.hots)) merged.push(...data.data.hots);

        const parsed: Array<Partial<SocialCommentItem>> = [];
        for (const raw of merged) {
            const comment = raw as Record<string, any>;
            const rootId = Number(comment.root || 0);
            const selfId = Number(comment.rpid || 0);
            const isSubReply = rootId > 0 && selfId > 0 && rootId !== selfId;
            const parentId = isSubReply ? String(rootId) : null;
            const main = this.parseApiComment(comment, isSubReply, parentId);
            if (main) parsed.push(main);

            if (Array.isArray(comment.replies)) {
                for (const replyRaw of comment.replies) {
                    const reply = this.parseApiComment(replyRaw as Record<string, any>, true, this.cleanText(String(comment.rpid || '')) || null);
                    if (reply) parsed.push(reply);
                }
            }
        }

        return parsed;
    }

    private collectRendererNodes(root: ParentNode, nodes: Element[], depth = 0) {
        if (depth > 6) return;

        const renderers = Array.from(root.querySelectorAll('bili-comment-renderer, bili-comment-reply-renderer'));
        renderers.forEach((renderer) => nodes.push(renderer));

        const allChildren = Array.from(root.querySelectorAll('*')) as HTMLElement[];
        for (const child of allChildren) {
            if (child.shadowRoot) {
                this.collectRendererNodes(child.shadowRoot, nodes, depth + 1);
            }
        }
    }

    private parseRendererNode(renderer: Element): Partial<SocialCommentItem> | null {
        const host = renderer as HTMLElement;
        const root = host.shadowRoot;
        if (!root) return null;

        let content = '';
        const richText = root.querySelector('bili-rich-text') as HTMLElement | null;
        if (richText?.shadowRoot) {
            const richNode = richText.shadowRoot.querySelector('#contents');
            content = this.cleanText(richNode?.textContent || '');
        }
        if (!content) {
            content = this.cleanText(root.querySelector('#contents, .reply-content, .content')?.textContent || '');
        }
        if (!content) return null;

        const userNode = root.querySelector('#user-name a, a[href*="space.bilibili.com"], .user-name a') as HTMLAnchorElement | null;
        const user = this.cleanText(userNode?.textContent || '') || '匿名用户';
        const userLink = this.toAbsoluteUrl(userNode?.getAttribute('href') || userNode?.href || '');
        const uid = userLink.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '';

        const actionNode = root.querySelector('bili-comment-action-buttons-renderer') as HTMLElement | null;
        const actionRoot = actionNode?.shadowRoot || null;
        const likeText = this.cleanText(
            actionRoot?.querySelector('#like #count')?.textContent
            || root.querySelector('#like #count, .like-count')?.textContent
            || ''
        );
        const time = this.cleanText(
            actionRoot?.querySelector('#pubdate')?.textContent
            || root.querySelector('#pubdate, .pubdate, .reply-time, .time')?.textContent
            || ''
        );

        const rawId = this.cleanText(
            host.getAttribute('rpid')
            || host.getAttribute('data-rpid')
            || host.getAttribute('comment-id')
            || ''
        );
        const id = rawId || `${this.platformKey}_dom_${this.shortHash(`${user}|${content}`)}`;

        return {
            id,
            contentId: this.getCurrentContentId(),
            user,
            userId: uid,
            userLink,
            content,
            likes: this.parseCompactNumber(likeText),
            time,
            ipLocation: '',
            isReply: host.tagName.toLowerCase().includes('reply'),
            parentId: null,
            source: 'dom_shadow'
        };
    }

    private parseLegacyDomComments(): Array<Partial<SocialCommentItem>> {
        const items = Array.from(document.querySelectorAll('.reply-item, .sub-reply-item, .comment-item, .reply-wrap'));
        const parsed: Array<Partial<SocialCommentItem>> = [];

        for (const item of items) {
            const content = this.cleanText(
                item.querySelector('.reply-content, .text, .content')?.textContent
                || item.textContent
                || ''
            );
            if (!content || content.length < 2) continue;

            const userNode = item.querySelector('a[href*="space.bilibili.com"], .user-name, .name') as HTMLAnchorElement | null;
            const userLink = this.toAbsoluteUrl(userNode?.getAttribute('href') || userNode?.href || '');
            const userId = userLink.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '';
            const user = this.cleanText(userNode?.textContent || '') || '匿名用户';

            const likeText = this.cleanText(item.querySelector('.reply-like, .like, .like-count')?.textContent || '');
            const time = this.cleanText(item.querySelector('.reply-time, .time, .pubdate')?.textContent || '');
            const isReply = !!item.closest('.sub-reply-item, .reply-box, .sub-reply-list');

            parsed.push({
                id: `${this.platformKey}_legacy_${this.shortHash(`${userId}|${content}|${time}`)}`,
                contentId: this.getCurrentContentId(),
                user,
                userId,
                userLink,
                content,
                likes: this.parseCompactNumber(likeText),
                time,
                ipLocation: '',
                isReply,
                parentId: null,
                source: 'dom'
            });
        }

        return parsed;
    }

    private parseDomComments(): Array<Partial<SocialCommentItem>> {
        const parsed: Array<Partial<SocialCommentItem>> = [];

        const host = document.querySelector('bili-comments, #commentapp, #comment');
        if (host) {
            const roots: ParentNode[] = [];
            if ((host as HTMLElement).shadowRoot) {
                roots.push((host as HTMLElement).shadowRoot as ShadowRoot);
            }
            roots.push(host);

            for (const root of roots) {
                const renderers: Element[] = [];
                this.collectRendererNodes(root, renderers);
                for (const renderer of renderers) {
                    const item = this.parseRendererNode(renderer);
                    if (item) parsed.push(item);
                }
            }
        }

        parsed.push(...this.parseLegacyDomComments());
        return parsed;
    }

    private async expandReplies() {
        const candidates = Array.from(document.querySelectorAll('button, a, span, bili-text-button'));
        let count = 0;

        for (const candidate of candidates) {
            let target: HTMLElement | null = candidate as HTMLElement;
            if (candidate.tagName === 'BILI-TEXT-BUTTON') {
                const inner = (candidate as HTMLElement).shadowRoot?.querySelector('button') as HTMLElement | null;
                if (inner) target = inner;
            }

            if (!this.isElementVisible(target)) continue;
            const text = this.cleanText(target.textContent || (candidate as HTMLElement).textContent || '');
            if (!text || text.length > 24) continue;
            if (/^\d+$/.test(text)) continue;

            const shouldClick = text.includes('展开')
                || text.includes('查看更多')
                || text.includes('查看全部')
                || text.includes('下一页')
                || text.includes('回复');
            if (!shouldClick) continue;

            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            count += 1;
            await this.wait(150);
            if (count >= 30) break;
        }

        return count;
    }

    private async scrollOnce(waitMs: number) {
        const before = window.scrollY;
        const step = Math.max(380, Math.floor(window.innerHeight * 0.82));
        window.scrollBy(0, step);
        await this.wait(Math.max(260, waitMs));

        const after = window.scrollY;
        const reachedBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
        return {
            moved: after > before + 1,
            reachedBottom
        };
    }

    private async ensureCommentAreaVisible() {
        const node = document.querySelector('#commentapp, #comment, bili-comments');
        if (node && this.isElementVisible(node)) {
            node.scrollIntoView({ behavior: 'auto', block: 'start' });
            await this.wait(400);
        }
    }

    protected normalizeDetailUrl(rawUrl: string): string | null {
        let parsed: URL;
        try {
            parsed = new URL(rawUrl, window.location.origin);
        } catch (_) {
            return null;
        }

        const host = parsed.hostname.toLowerCase();
        if (host === 'b23.tv') {
            parsed.hash = '';
            return parsed.toString();
        }

        if (!host.includes('bilibili.com')) return null;
        const match = parsed.pathname.match(/\/video\/(BV[a-z0-9]+|av\d+)/i);
        if (!match?.[1]) return null;
        return `https://www.bilibili.com/video/${match[1]}`;
    }

    protected isDetailPageUrl(url: URL): boolean {
        const host = url.hostname.toLowerCase();
        if (!host.includes('bilibili.com')) return false;
        return /\/video\/(BV[a-z0-9]+|av\d+)(?:\/)?$/i.test(url.pathname);
    }

    protected extractContentId(url: URL): string {
        const match = url.pathname.match(/\/video\/(BV[a-z0-9]+|av\d+)/i);
        return match?.[1] || '';
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
            this.reportProgress('正在准备B站评论区...', {
                total: 0,
                round: 0,
                maxRounds: options.maxRounds
            });

            await this.ensureCommentAreaVisible();
            await this.wait(Math.min(1500, options.scrollWaitMs + 300));

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

                const scrollResult = await this.scrollOnce(options.scrollWaitMs);
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
