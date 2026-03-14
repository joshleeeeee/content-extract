import type { BatchQueueItem, BatchResultItem } from './types'
import type { WindowPool } from '../infra/chrome/windowClient'

export interface ActiveTaskEntry {
    item: BatchQueueItem
    tabId: number | null
    startedAt: number
}

export interface BatchRuntimeState {
    BATCH_QUEUE: BatchQueueItem[]
    isProcessing: boolean
    isPaused: boolean
    processedResults: BatchResultItem[]
    currentItem: BatchQueueItem | null
    currentTabId: number | null
    isReady: boolean
    activeTasks: Map<string, ActiveTaskEntry>
    cancelledTaskKeys: Set<string>
    extractionRequestToTaskKey: Map<string, string>
    lastProgressPersistAt: number
    windowPool: WindowPool | null
    useWindowMode: boolean
    windowPoolSize: number
}

export const runtimeState: BatchRuntimeState = {
    BATCH_QUEUE: [],
    isProcessing: false,
    isPaused: false,
    processedResults: [],
    currentItem: null,
    currentTabId: null,
    isReady: false,
    activeTasks: new Map(),
    cancelledTaskKeys: new Set(),
    extractionRequestToTaskKey: new Map(),
    lastProgressPersistAt: 0,
    windowPool: null,
    useWindowMode: false,
    windowPoolSize: 2
}
