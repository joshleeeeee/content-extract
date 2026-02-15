import { BaseAdapter } from './base';
import { BossZhipinAdapter } from './boss';
import { FeishuAdapter } from './feishu';
import { JdReviewAdapter } from './jd-review';
import { registerPlatformAdapterPlugin, resolvePlatformAdapter } from './plugin-registry';
import type { PlatformAdapterPlugin } from './plugin-types';
import { TaobaoReviewAdapter } from './taobao-review';

export class PlatformAdapterFactory {
    static getAdapter(format: string, options: any): BaseAdapter | null {
        return resolvePlatformAdapter(format, options);
    }
}

export function registerAdapterPlugin(plugin: PlatformAdapterPlugin) {
    registerPlatformAdapterPlugin(plugin);
}

export { BaseAdapter, BossZhipinAdapter, FeishuAdapter, JdReviewAdapter, TaobaoReviewAdapter };
export type { PlatformAdapterPlugin };
