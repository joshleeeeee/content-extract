import { PlatformAdapterFactory } from './adapters';
import JSZip from 'jszip';
import type { ExtractFormat } from '../shared/contracts/content';

export class ExtractionHandler {
    static async extract(format: string, options: any) {
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

    static async scan() {
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

    static async downloadLocally(format: ExtractFormat, options: any) {
        const result = await ExtractionHandler.extract(format, options) as { content?: string; images?: any[] };
        const content = FileUtils.encodeExportContent(format, result?.content || '');
        const images = Array.isArray(result?.images) ? result.images : [];
        const rawTitle = FileUtils.normalizeExportTitle(options?.batchItemTitle || document.title || 'document') || options?.batchItemTitle || document.title || 'document';
        const safeTitle = FileUtils.sanitizeFilename(rawTitle);
        const formatMeta = FileUtils.getExportFormatMeta(format);

        if (images.length > 0) {
            const zip = new JSZip();
            const contentFilename = `${safeTitle}${formatMeta.ext}`;
            const imgFolder = zip.folder('images');

            images.forEach((img: any) => {
                if (img.base64 && typeof img.base64 === 'string' && img.base64.includes(',')) {
                    const base64Data = img.base64.split(',')[1];
                    imgFolder?.file(img.filename, base64Data, { base64: true });
                }
            });

            zip.file(contentFilename, content);
            const blob = await zip.generateAsync({ type: 'blob' });
            FileUtils.triggerFileDownload(blob, `${safeTitle}.zip`);
            return { hasImages: true, imageCount: images.length };
        }

        const blob = new Blob([content], { type: formatMeta.mime });
        FileUtils.triggerFileDownload(blob, `${safeTitle}${formatMeta.ext}`);
        return { hasImages: false, imageCount: 0 };
    }

    static async createLocalArchive(format: ExtractFormat, options: any) {
        console.log('[LocalArchive] Start archive extraction');
        const result = await ExtractionHandler.extract(format, options) as { content?: string; images?: any[] };
        const content = FileUtils.encodeExportContent(format, result?.content || '');
        const images = Array.isArray(result?.images) ? result.images : [];
        const rawTitle = FileUtils.normalizeExportTitle(options?.batchItemTitle || document.title || 'document') || options?.batchItemTitle || document.title || 'document';
        const safeTitle = FileUtils.sanitizeFilename(rawTitle);
        const formatMeta = FileUtils.getExportFormatMeta(format);

        const zip = new JSZip();
        const contentFilename = `${safeTitle}${formatMeta.ext}`;
        const imgFolder = zip.folder('images');

        images.forEach((img: any) => {
            if (img.base64 && typeof img.base64 === 'string' && img.base64.includes(',')) {
                const base64Data = img.base64.split(',')[1];
                imgFolder?.file(img.filename, base64Data, { base64: true });
            }
        });

        zip.file(contentFilename, content);
        console.log(`[LocalArchive] Build zip: content + ${images.length} images`);

        let lastLoggedStep = -1;
        const archiveBlob = await TimeoutUtils.withTimeout(
            zip.generateAsync(
                { type: 'blob', compression: 'STORE' },
                (meta) => {
                    const step = Math.floor(meta.percent / 10);
                    if (step !== lastLoggedStep) {
                        lastLoggedStep = step;
                        console.log(`[LocalArchive] Packaging ${Math.round(meta.percent)}%`);
                    }
                }
            ),
            3 * 60_000,
            '本地归档打包超时（请减少单次抓取内容）'
        );

        console.log(`[LocalArchive] Zip size: ${(archiveBlob.size / (1024 * 1024)).toFixed(2)} MB`);

        const archiveBase64 = await TimeoutUtils.withTimeout(
            BlobUtils.blobToBase64Data(archiveBlob),
            60_000,
            '归档编码超时（请减少单次抓取内容）'
        );
        const archiveSize = archiveBlob.size;
        console.log('[LocalArchive] Archive ready');

        const MAX_INLINE_SIZE = 8 * 1024 * 1024;
        if (archiveSize > MAX_INLINE_SIZE) {
            const storageKey = `localArchive:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
            await StorageUtils.set({ [storageKey]: archiveBase64 });
            console.log(`[LocalArchive] Stored archive in chrome.storage.local: ${storageKey}`);
            return {
                archiveStorageKey: storageKey,
                archiveName: `${safeTitle}.zip`,
                archiveSize,
                imageCount: images.length
            };
        }

        return {
            archiveBase64,
            archiveName: `${safeTitle}.zip`,
            archiveSize,
            imageCount: images.length
        };
    }
}

class FileUtils {
    static sanitizeFilename(name: string) {
        return (name || 'document').replace(/[\\/:*?"<>|]/g, "_");
    }

    static normalizeExportTitle(title: string) {
        return (title || '')
            .replace(/\s*[-|｜]\s*(feishu|lark)\s*docs?$/i, '')
            .replace(/\s*[-|｜]\s*飞书(云)?文档$/i, '')
            .replace(/\s*[-|｜]\s*文档$/i, '')
            .trim();
    }

    static getExportFormatMeta(format: string) {
        if (format === 'html') {
            return { ext: '.html', mime: 'text/html;charset=utf-8' };
        }
        if (format === 'csv') {
            return { ext: '.csv', mime: 'text/csv;charset=utf-8' };
        }
        if (format === 'json') {
            return { ext: '.json', mime: 'application/json;charset=utf-8' };
        }
        return { ext: '.md', mime: 'text/markdown;charset=utf-8' };
    }

    static encodeExportContent(format: string, content: string) {
        if (format === 'csv') {
            return content.startsWith('\uFEFF') ? content : `\uFEFF${content}`;
        }
        return content;
    }

    static triggerFileDownload(blob: Blob, filename: string) {
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(dlUrl);
    }
}

class BlobUtils {
    static blobToBase64Data(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const full = String(reader.result || '');
                const comma = full.indexOf(',');
                resolve(comma >= 0 ? full.slice(comma + 1) : full);
            };
            reader.onerror = () => reject(reader.error || new Error('Blob to base64 failed'));
            reader.readAsDataURL(blob);
        });
    }
}

class StorageUtils {
    static set(items: Record<string, any>) {
        return new Promise<void>((resolve, reject) => {
            chrome.storage.local.set(items, () => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
    }
}

class TimeoutUtils {
    static async withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
        let timer: number | null = null;
        try {
            return await Promise.race([
                task,
                new Promise<T>((_, reject) => {
                    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
                })
            ]);
        } finally {
            if (timer) window.clearTimeout(timer);
        }
    }
}
