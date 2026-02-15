import type { PlatformAdapterPlugin } from '../plugin-types'
import { bossAdapterPlugin } from './boss'
import { feishuAdapterPlugin } from './feishu'
import { jdAdapterPlugin } from './jd'
import { taobaoAdapterPlugin } from './taobao'

export const builtInAdapterPlugins: PlatformAdapterPlugin[] = [
    feishuAdapterPlugin,
    bossAdapterPlugin,
    jdAdapterPlugin,
    taobaoAdapterPlugin
]
