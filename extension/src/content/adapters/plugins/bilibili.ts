import { BilibiliReviewAdapter } from '../bilibili-review'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const bilibiliAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'bilibili',
    createAdapter: ({ format, options }) => new BilibiliReviewAdapter(format, options)
}
