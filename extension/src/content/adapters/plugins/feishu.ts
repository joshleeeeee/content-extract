import { FeishuAdapter } from '../feishu'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const feishuAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'feishu',
    createAdapter: ({ format, options }) => new FeishuAdapter(format, options)
}
