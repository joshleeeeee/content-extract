import type { PlatformAdapterPlugin } from '../plugin-types'
import { bilibiliAdapterPlugin } from './bilibili'
import { bossAdapterPlugin } from './boss'
import { douyinAdapterPlugin } from './douyin'
import { feishuAdapterPlugin } from './feishu'
import { jdAdapterPlugin } from './jd'
import { taobaoAdapterPlugin } from './taobao'
import { xiaohongshuAdapterPlugin } from './xiaohongshu'

export const builtInAdapterPlugins: PlatformAdapterPlugin[] = [
    feishuAdapterPlugin,
    bossAdapterPlugin,
    jdAdapterPlugin,
    taobaoAdapterPlugin,
    douyinAdapterPlugin,
    xiaohongshuAdapterPlugin,
    bilibiliAdapterPlugin
]
