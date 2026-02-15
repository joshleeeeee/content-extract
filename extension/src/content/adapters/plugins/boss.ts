import { BossZhipinAdapter } from '../boss'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const bossAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'boss',
    createAdapter: ({ format, options }) => new BossZhipinAdapter(format, options)
}
