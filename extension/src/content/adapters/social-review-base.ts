import { RUNTIME_ACTIONS } from '../../shared/contracts/runtime';
import { BaseAdapter } from './base';
import type { SocialCollectOptions, SocialCommentItem, SocialPlatformKey } from './social-review-types';

export abstract class SocialReviewAdapter extends BaseAdapter {
    protected abstract readonly platformKey: SocialPlatformKey;
    protected abstract readonly platformLabel: string;
    protected abstract readonly scanLinkSelectors: string[];
    protected readonly titleSuffixPattern?: RegExp;

    protected abstract normalizeDetailUrl(rawUrl: string): string | null;

    protected abstract isDetailPageUrl(url: URL): boolean;

    protected abstract extractContentId(url: URL): string;

    protected abstract collectComments(options: SocialCollectOptions): Promise<SocialCommentItem[]>;

    protected cleanText(value: string | null | undefined): string {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    protected nowText() {
        const date = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    protected parseCompactNumber(value: string): number {
        const text = this.cleanText(value).toLowerCase();
        if (!text) return 0;

        const normalized = text.replace(/,/g, '');
        const m = normalized.match(/^([\d.]+)\s*([wk万亿]?)$/i);
        if (!m) {
            const direct = Number(normalized);
            return Number.isFinite(direct) ? Math.max(0, Math.round(direct)) : 0;
        }

        const base = Number(m[1]);
        if (!Number.isFinite(base)) return 0;
        const unit = m[2] || '';

        if (unit === 'w' || unit === '万') return Math.round(base * 10_000);
        if (unit === 'k') return Math.round(base * 1_000);
        if (unit === '亿') return Math.round(base * 100_000_000);
        return Math.round(base);
    }

    protected toAbsoluteUrl(rawUrl: string): string {
        const value = this.cleanText(rawUrl);
        if (!value) return '';
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith('//')) return `https:${value}`;
        try {
            return new URL(value, window.location.origin).toString();
        } catch (_) {
            return value;
        }
    }

    protected getCurrentContentId() {
        try {
            return this.extractContentId(new URL(window.location.href));
        } catch (_) {
            return '';
        }
    }

    protected getCollectOptions(): SocialCollectOptions {
        const maxCountRaw = Number(this.options?.socialMaxCount ?? this.options?.reviewMaxCount ?? 300);
        const maxCount = Number.isFinite(maxCountRaw)
            ? Math.max(0, Math.min(5000, Math.floor(maxCountRaw)))
            : 300;

        const maxRoundsRaw = Number(this.options?.socialMaxRounds ?? (Number(this.options?.reviewMaxPages || 3) * 20));
        const maxRounds = Number.isFinite(maxRoundsRaw)
            ? Math.max(10, Math.min(400, Math.floor(maxRoundsRaw)))
            : 60;

        const idleRaw = Number(this.options?.socialIdleRoundLimit ?? 6);
        const idleRoundLimit = Number.isFinite(idleRaw)
            ? Math.max(2, Math.min(20, Math.floor(idleRaw)))
            : 6;

        const waitRaw = Number(this.options?.scrollWaitTime || 1200);
        const scrollWaitMs = Number.isFinite(waitRaw)
            ? Math.max(200, Math.min(5000, Math.floor(waitRaw)))
            : 1200;

        return {
            maxCount,
            maxRounds,
            idleRoundLimit,
            includeReplies: this.options?.socialIncludeReplies !== false,
            scrollWaitMs
        };
    }

    protected reportProgress(message: string, extra: Record<string, unknown> = {}) {
        const requestId = this.cleanText(String(this.options?.extractRequestId || ''));
        if (!requestId) return;
        if (!chrome?.runtime?.sendMessage) return;

        try {
            chrome.runtime.sendMessage({
                action: RUNTIME_ACTIONS.EXTRACTION_PROGRESS,
                requestId,
                platform: this.platformKey,
                taskType: 'review',
                message,
                ...extra
            }, () => {
                void chrome.runtime.lastError;
            });
        } catch (_) {
            // ignore
        }
    }

    protected normalizeComment(raw: Partial<SocialCommentItem>): SocialCommentItem | null {
        const content = this.cleanText(raw.content);
        if (!content) return null;

        const user = this.cleanText(raw.user) || '匿名用户';
        const baseId = this.cleanText(raw.id);
        const generatedId = `${this.platformKey}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const contentId = this.cleanText(raw.contentId) || this.getCurrentContentId();

        return {
            id: baseId || generatedId,
            platform: this.platformKey,
            contentId,
            user,
            userId: this.cleanText(raw.userId),
            userLink: this.toAbsoluteUrl(this.cleanText(raw.userLink)),
            userAvatar: this.toAbsoluteUrl(this.cleanText(raw.userAvatar)),
            content,
            likes: Math.max(0, Number(raw.likes || 0) || 0),
            time: this.cleanText(raw.time),
            ipLocation: this.cleanText(raw.ipLocation),
            isReply: !!raw.isReply,
            parentId: this.cleanText(raw.parentId || '') || null,
            replyCount: Math.max(0, Number(raw.replyCount || 0) || 0),
            source: this.cleanText(raw.source) || 'unknown',
            crawledAt: this.cleanText(raw.crawledAt) || this.nowText()
        };
    }

    protected buildDedupKey(comment: SocialCommentItem): string {
        const strongId = this.cleanText(comment.id);
        if (strongId) return `id:${strongId}`;

        const userId = this.cleanText(comment.userId);
        const user = this.cleanText(comment.user).toLowerCase();
        const content = this.cleanText(comment.content).toLowerCase();
        const parentId = this.cleanText(comment.parentId || '');
        return `${userId || user}|${parentId}|${content}`;
    }

    protected pushUniqueComments(
        target: SocialCommentItem[],
        dedup: Set<string>,
        incoming: Array<Partial<SocialCommentItem>>,
        includeReplies = true
    ) {
        let added = 0;
        for (const raw of incoming) {
            const normalized = this.normalizeComment(raw);
            if (!normalized) continue;
            if (!includeReplies && normalized.isReply) continue;

            const key = this.buildDedupKey(normalized);
            if (dedup.has(key)) continue;
            dedup.add(key);
            target.push(normalized);
            added += 1;
        }
        return added;
    }

    protected normalizeTitle(value: string): string {
        const text = this.cleanText(value);
        if (!text) return '';
        if (!this.titleSuffixPattern) return text;
        return text.replace(this.titleSuffixPattern, '').trim();
    }

    protected getExportTitle(pageUrl: string, contentId: string): string {
        const fromDom = this.normalizeTitle(document.title || '');
        if (fromDom) return fromDom;
        if (contentId) return `${this.platformLabel}_${contentId}`;
        return `${this.platformLabel}_评论`;
    }

    protected escapeHtml(value: string): string {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    protected escapeCsv(value: string): string {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    }

    protected buildMarkdown(
        title: string,
        contentId: string,
        pageUrl: string,
        comments: SocialCommentItem[]
    ) {
        const lines: string[] = [];
        lines.push(`# ${title}`);
        lines.push('');
        lines.push(`- 平台：${this.platformLabel}`);
        if (contentId) lines.push(`- 内容ID：${contentId}`);
        lines.push(`- 抓取链接：${pageUrl}`);
        lines.push(`- 抓取时间：${this.nowText()}`);
        lines.push(`- 评论总数：${comments.length}`);
        lines.push('');
        lines.push('## 评论列表');
        lines.push('');

        if (comments.length === 0) {
            lines.push('> 当前页面未抓取到评论，请确认评论区已展开并可滚动。');
            lines.push('');
            return lines.join('\n');
        }

        comments.forEach((comment, index) => {
            lines.push(`### ${index + 1}. ${comment.user}`);
            if (comment.time) lines.push(`- 时间：${comment.time}`);
            if (comment.likes > 0) lines.push(`- 点赞：${comment.likes}`);
            if (comment.ipLocation) lines.push(`- IP属地：${comment.ipLocation}`);
            if (comment.isReply) lines.push(`- 类型：回复${comment.parentId ? `（父评论 ${comment.parentId}）` : ''}`);
            lines.push(`- 内容：${comment.content}`);
            lines.push('');
        });

        return lines.join('\n');
    }

    protected buildHtml(
        title: string,
        contentId: string,
        pageUrl: string,
        comments: SocialCommentItem[]
    ) {
        const header = [
            `<h1>${this.escapeHtml(title)}</h1>`,
            `<p><strong>平台</strong>: ${this.escapeHtml(this.platformLabel)}</p>`,
            contentId ? `<p><strong>内容ID</strong>: ${this.escapeHtml(contentId)}</p>` : '',
            `<p><strong>抓取链接</strong>: <a href="${this.escapeHtml(pageUrl)}">${this.escapeHtml(pageUrl)}</a></p>`,
            `<p><strong>抓取时间</strong>: ${this.escapeHtml(this.nowText())}</p>`,
            `<p><strong>评论总数</strong>: ${comments.length}</p>`,
            '<h2>评论列表</h2>'
        ].filter(Boolean).join('');

        if (comments.length === 0) {
            return `${header}<p>当前页面未抓取到评论，请确认评论区已展开并可滚动。</p>`;
        }

        const body = comments.map((comment, index) => {
            const lines = [
                comment.time ? `<p><strong>时间</strong>: ${this.escapeHtml(comment.time)}</p>` : '',
                `<p><strong>点赞</strong>: ${comment.likes}</p>`,
                comment.ipLocation ? `<p><strong>IP属地</strong>: ${this.escapeHtml(comment.ipLocation)}</p>` : '',
                comment.isReply ? `<p><strong>类型</strong>: 回复${comment.parentId ? `（父评论 ${this.escapeHtml(comment.parentId)}）` : ''}</p>` : '',
                `<p><strong>内容</strong>: ${this.escapeHtml(comment.content)}</p>`
            ].filter(Boolean).join('');
            return `<section><h3>${index + 1}. ${this.escapeHtml(comment.user)}</h3>${lines}</section>`;
        }).join('');

        return `${header}${body}`;
    }

    protected buildCsv(
        title: string,
        contentId: string,
        pageUrl: string,
        comments: SocialCommentItem[]
    ) {
        const capturedAt = new Date().toISOString();
        const lines: string[] = [];
        lines.push('platform,content_id,source_url,captured_at,index,id,parent_id,is_reply,user,user_id,user_link,user_avatar,likes,time,ip_location,content,reply_count,source');

        comments.forEach((comment, index) => {
            const columns = [
                this.platformLabel,
                contentId,
                pageUrl,
                capturedAt,
                String(index + 1),
                comment.id,
                comment.parentId || '',
                comment.isReply ? '1' : '0',
                comment.user,
                comment.userId,
                comment.userLink,
                comment.userAvatar,
                String(comment.likes || 0),
                comment.time,
                comment.ipLocation,
                comment.content,
                String(comment.replyCount || 0),
                comment.source
            ];
            lines.push(columns.map((item) => this.escapeCsv(item)).join(','));
        });

        return lines.join('\n');
    }

    protected buildJson(
        title: string,
        contentId: string,
        pageUrl: string,
        comments: SocialCommentItem[],
        options: SocialCollectOptions
    ) {
        const payload = {
            platform: this.platformLabel,
            title,
            contentId,
            sourceUrl: pageUrl,
            capturedAt: new Date().toISOString(),
            reviewCount: comments.length,
            filters: {
                includeReplies: options.includeReplies,
                maxCount: options.maxCount,
                maxRounds: options.maxRounds
            },
            reviews: comments
        };
        return JSON.stringify(payload, null, 2);
    }

    async scanLinks(): Promise<{ title: string; url: string }[]> {
        const result: { title: string; url: string }[] = [];
        const seen = new Set<string>();

        const pushItem = (rawUrl: string, rawTitle: string) => {
            const normalizedUrl = this.normalizeDetailUrl(rawUrl);
            if (!normalizedUrl || seen.has(normalizedUrl)) return;
            seen.add(normalizedUrl);

            const title = this.cleanText(rawTitle)
                || this.getExportTitle(normalizedUrl, '');
            result.push({ title, url: normalizedUrl });
        };

        for (const selector of this.scanLinkSelectors) {
            const anchors = Array.from(document.querySelectorAll(selector)) as HTMLAnchorElement[];
            for (const anchor of anchors) {
                const href = anchor.href || anchor.getAttribute('href') || '';
                if (!href) continue;

                const title = this.cleanText(anchor.getAttribute('title'))
                    || this.cleanText(anchor.textContent)
                    || this.cleanText(anchor.querySelector('img')?.getAttribute('alt'));
                pushItem(href, title);
            }
        }

        try {
            const current = new URL(window.location.href);
            if (this.isDetailPageUrl(current)) {
                pushItem(window.location.href, this.getExportTitle(window.location.href, this.extractContentId(current)));
            }
        } catch (_) {
            // ignore
        }

        return result;
    }

    async extract(): Promise<{ content: string; images: any[] }> {
        const pageUrl = window.location.href.split('#')[0];
        let contentId = '';
        try {
            contentId = this.extractContentId(new URL(window.location.href));
        } catch (_) {
            // ignore
        }

        const title = this.getExportTitle(pageUrl, contentId);
        const options = this.getCollectOptions();
        this.reportProgress(`正在抓取${this.platformLabel}评论...`, {
            total: 0,
            round: 0,
            maxRounds: options.maxRounds
        });

        const comments = await this.collectComments(options);
        const finalComments = options.maxCount > 0
            ? comments.slice(0, options.maxCount)
            : comments;

        this.reportProgress(`评论抓取完成：共 ${finalComments.length} 条`, {
            done: true,
            total: finalComments.length
        });

        let content = '';
        if (this.format === 'html') {
            content = this.buildHtml(title, contentId, pageUrl, finalComments);
        } else if (this.format === 'csv') {
            content = this.buildCsv(title, contentId, pageUrl, finalComments);
        } else if (this.format === 'json') {
            content = this.buildJson(title, contentId, pageUrl, finalComments, options);
        } else {
            content = this.buildMarkdown(title, contentId, pageUrl, finalComments);
        }

        return {
            content,
            images: this.images
        };
    }
}
