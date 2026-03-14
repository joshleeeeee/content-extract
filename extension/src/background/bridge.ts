import { runtimeTaskCenter } from './taskCenter'
import { runtimeState } from './state'
import { isBatchArchiveResult, type BatchResultItem } from './types'
import {
    isRuntimeAction,
    RUNTIME_ACTIONS,
    type GetBatchStatusResponse,
    type RuntimeAction,
    type RuntimeRequest,
    type RuntimeResponse
} from '../shared/contracts/runtime'

const BRIDGE_ALARM_NAME = 'content-extract-cli-bridge'
const BRIDGE_POLL_INTERVAL_MINUTES = 0.5
const REQUEST_TIMEOUT_MS = 8_000
const DEFAULT_BRIDGE_HOST = '127.0.0.1'
const DEFAULT_BRIDGE_PORT = 17327
const BRIDGE_CONFIG_KEYS = ['cliBridgeBaseUrl', 'cliBridgeHost', 'cliBridgePort'] as const

interface BridgeCommand {
    commandId: string
    action: RuntimeAction
    payload: RuntimeRequest
    createdAt: number
}

interface BridgeCommandPollResponse {
    success: boolean
    commands?: BridgeCommand[]
}

interface BridgeSyncResponse {
    success: boolean
    missingResultJobIds?: string[]
}

const bridgeRuntimeState = {
    syncPromise: null as Promise<void> | null
}

function normalizeBridgePort(raw: unknown): number {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_BRIDGE_PORT
}

function normalizeBridgeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '')
}

async function getStoredBridgeConfig(): Promise<Record<string, unknown>> {
    return await chrome.storage.local.get([...BRIDGE_CONFIG_KEYS]) as Record<string, unknown>
}

async function resolveBridgeBaseUrl(): Promise<string> {
    const stored = await getStoredBridgeConfig()
    if (typeof stored.cliBridgeBaseUrl === 'string' && stored.cliBridgeBaseUrl.trim()) {
        return normalizeBridgeBaseUrl(stored.cliBridgeBaseUrl.trim())
    }

    const host = typeof stored.cliBridgeHost === 'string' && stored.cliBridgeHost.trim()
        ? stored.cliBridgeHost.trim()
        : (import.meta.env.VITE_CONTENT_EXTRACT_CLI_HOST || DEFAULT_BRIDGE_HOST)

    const port = stored.cliBridgePort !== undefined
        ? normalizeBridgePort(stored.cliBridgePort)
        : normalizeBridgePort(import.meta.env.VITE_CONTENT_EXTRACT_CLI_PORT)

    return `http://${host}:${port}`
}

function getClientMetadata() {
    const manifest = chrome.runtime.getManifest()
    return {
        clientId: chrome.runtime.id,
        extensionId: chrome.runtime.id,
        extensionVersion: manifest.version,
        userAgent: navigator.userAgent
    }
}

async function fetchJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        const baseUrl = await resolveBridgeBaseUrl()
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: {
                'content-type': 'application/json',
                ...(init?.headers || {})
            },
            signal: controller.signal
        })
        if (!response.ok) {
            throw new Error(`Bridge HTTP ${response.status}`)
        }
        return await response.json() as TResponse
    } finally {
        clearTimeout(timer)
    }
}

async function fetchArchiveBase64ByKey(key: string): Promise<string | null> {
    return await new Promise((resolve) => {
        chrome.storage.local.get([key], (res) => {
            resolve((res && typeof res[key] === 'string') ? res[key] : null)
        })
    })
}

async function materializeBridgeResult(item: BatchResultItem): Promise<BatchResultItem> {
    if (!isBatchArchiveResult(item) || item.archiveBase64 || !item.archiveStorageKey) {
        return item
    }

    const archiveBase64 = await fetchArchiveBase64ByKey(item.archiveStorageKey)
    if (!archiveBase64) return item

    return {
        ...item,
        archiveBase64
    }
}

async function executeBridgeCommand(command: BridgeCommand) {
    if (!isRuntimeAction(command.action)) {
        return {
            commandId: command.commandId,
            success: false,
            error: `Unsupported action: ${command.action}`
        }
    }

    const handler = runtimeTaskCenter[command.action] as ((payload: RuntimeRequest) => Promise<RuntimeResponse>) | undefined
    if (!handler) {
        return {
            commandId: command.commandId,
            success: false,
            error: `Missing handler for action: ${command.action}`
        }
    }

    try {
        const response = await handler(command.payload as RuntimeRequest) as RuntimeResponse & { success?: boolean; error?: string }
        return {
            commandId: command.commandId,
            success: response?.success !== false,
            response,
            error: response?.success === false ? response.error : undefined
        }
    } catch (error: any) {
        return {
            commandId: command.commandId,
            success: false,
            error: error?.message || String(error)
        }
    }
}

async function collectMissingResults(jobIds: string[]): Promise<BatchResultItem[]> {
    if (!jobIds.length) return []

    const results: BatchResultItem[] = []
    for (const item of runtimeState.processedResults) {
        if (!jobIds.includes(item.jobId)) continue
        results.push(await materializeBridgeResult(item))
    }
    return results
}

async function syncCliBridgeOnce() {
    if (!runtimeState.isReady) return

    const client = getClientMetadata()
    const poll = await fetchJson<BridgeCommandPollResponse>(`/v1/bridge/commands?client_id=${encodeURIComponent(client.clientId)}`)
    const commands = Array.isArray(poll.commands) ? poll.commands : []
    const acks = []

    for (const command of commands) {
        acks.push(await executeBridgeCommand(command))
    }

    const status = await runtimeTaskCenter[RUNTIME_ACTIONS.GET_BATCH_STATUS]({
        action: RUNTIME_ACTIONS.GET_BATCH_STATUS
    }) as GetBatchStatusResponse

    const syncResponse = await fetchJson<BridgeSyncResponse>('/v1/bridge/sync', {
        method: 'POST',
        body: JSON.stringify({
            client,
            acks,
            status
        })
    })

    const missingResultJobIds = Array.isArray(syncResponse.missingResultJobIds)
        ? syncResponse.missingResultJobIds
        : []

    if (!missingResultJobIds.length) return

    const results = await collectMissingResults(missingResultJobIds)
    if (!results.length) return

    await fetchJson('/v1/bridge/results', {
        method: 'POST',
        body: JSON.stringify({
            client,
            results
        })
    })
}

async function runBridgeSync() {
    if (bridgeRuntimeState.syncPromise) {
        return await bridgeRuntimeState.syncPromise
    }

    bridgeRuntimeState.syncPromise = (async () => {
        try {
            await syncCliBridgeOnce()
        } catch (error) {
            console.debug('[CLI Bridge] sync skipped:', error)
        } finally {
            bridgeRuntimeState.syncPromise = null
        }
    })()

    return await bridgeRuntimeState.syncPromise
}

export async function initCliBridge() {
    try {
        chrome.alarms.clear(BRIDGE_ALARM_NAME, () => {
            void chrome.runtime.lastError
        })
        chrome.alarms.create(BRIDGE_ALARM_NAME, {
            periodInMinutes: BRIDGE_POLL_INTERVAL_MINUTES
        })
    } catch (error) {
        console.warn('[CLI Bridge] alarm init failed:', error)
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name !== BRIDGE_ALARM_NAME) return
        void runBridgeSync()
    })

    void runBridgeSync()
}
