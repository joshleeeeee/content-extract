import { XiaohongshuReviewAdapter } from '../xiaohongshu-review'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const xiaohongshuAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'xiaohongshu',
    createAdapter: ({ format, options }) => new XiaohongshuReviewAdapter(format, options)
}
