import { DouyinReviewAdapter } from '../douyin-review'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const douyinAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'douyin',
    createAdapter: ({ format, options }) => new DouyinReviewAdapter(format, options)
}
