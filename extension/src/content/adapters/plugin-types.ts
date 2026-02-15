import type { PlatformId } from '../../platformRegistry'
import type { BaseAdapter } from './base'

export interface AdapterPluginContext {
    format: string
    options: any
    hostname: string
    href: string
}

export interface PlatformAdapterPlugin {
    platformId: PlatformId
    createAdapter: (ctx: AdapterPluginContext) => BaseAdapter
}
