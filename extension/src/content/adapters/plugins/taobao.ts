import { TaobaoReviewAdapter } from '../taobao-review'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const taobaoAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'taobao',
    createAdapter: ({ format, options }) => new TaobaoReviewAdapter(format, options)
}
