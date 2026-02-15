import { JdReviewAdapter } from '../jd-review'
import type { PlatformAdapterPlugin } from '../plugin-types'

export const jdAdapterPlugin: PlatformAdapterPlugin = {
    platformId: 'jd',
    createAdapter: ({ format, options }) => new JdReviewAdapter(format, options)
}
