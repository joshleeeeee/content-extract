import { detectPlatformByHostname } from '../../platformRegistry'
import type { BaseAdapter } from './base'
import { builtInAdapterPlugins } from './plugins'
import type { AdapterPluginContext, PlatformAdapterPlugin } from './plugin-types'

class AdapterPluginRegistry {
    private readonly plugins = new Map<string, PlatformAdapterPlugin>()

    register(plugin: PlatformAdapterPlugin) {
        this.plugins.set(plugin.platformId, plugin)
    }

    resolveByHostname(hostname: string, context: AdapterPluginContext): BaseAdapter | null {
        const platform = detectPlatformByHostname(hostname)
        if (!platform) return null
        const plugin = this.plugins.get(platform.id)
        if (!plugin) return null
        return plugin.createAdapter(context)
    }
}

const adapterPluginRegistry = new AdapterPluginRegistry()
builtInAdapterPlugins.forEach((plugin) => adapterPluginRegistry.register(plugin))

export function registerPlatformAdapterPlugin(plugin: PlatformAdapterPlugin) {
    adapterPluginRegistry.register(plugin)
}

export function resolvePlatformAdapter(format: string, options: any): BaseAdapter | null {
    return adapterPluginRegistry.resolveByHostname(window.location.hostname, {
        format,
        options,
        hostname: window.location.hostname,
        href: window.location.href
    })
}
