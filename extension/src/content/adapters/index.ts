import { BaseAdapter } from './base';
import { BilibiliReviewAdapter } from './bilibili-review';
import { BossZhipinAdapter } from './boss';
import { DouyinReviewAdapter } from './douyin-review';
import { FeishuAdapter } from './feishu';
import { JdReviewAdapter } from './jd-review';
import { registerPlatformAdapterPlugin, resolvePlatformAdapter } from './plugin-registry';
import type { PlatformAdapterPlugin } from './plugin-types';
import { TaobaoReviewAdapter } from './taobao-review';
import { XiaohongshuReviewAdapter } from './xiaohongshu-review';

export class PlatformAdapterFactory {
    static getAdapter(format: string, options: any): BaseAdapter | null {
        return resolvePlatformAdapter(format, options);
    }
}

export function registerAdapterPlugin(plugin: PlatformAdapterPlugin) {
    registerPlatformAdapterPlugin(plugin);
}

export { BaseAdapter, BilibiliReviewAdapter, BossZhipinAdapter, DouyinReviewAdapter, FeishuAdapter, JdReviewAdapter, TaobaoReviewAdapter, XiaohongshuReviewAdapter };
export type { PlatformAdapterPlugin };
