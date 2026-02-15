import { handleRuntimeMessage } from './messageHandlers'
import { ensureProcessing } from './processor'
import { syncRuntimeState, updateConfiguredConcurrencyFromOptions } from './runtime'
import { runtimeState } from './state'
import { saveState } from './storage'
import {
    isBatchArchiveResult,
    isBatchContentResult,
    isBatchPdfResult,
    normalizeStoredQueueItem,
    normalizeStoredResultItem,
    type BatchQueueItem,
    type BatchResultItem
} from './types'

export type { BatchQueueItem, BatchResultItem } from './types'

const preparePromise = new Promise<void>((resolve) => {
    chrome.storage.local.get(['batchQueue', 'processedResults', 'isProcessing', 'isPaused'], (data) => {
        if (data && data.batchQueue && Array.isArray(data.batchQueue)) {
            runtimeState.BATCH_QUEUE = data.batchQueue
                .map((item) => normalizeStoredQueueItem(item))
                .filter((item): item is BatchQueueItem => !!item)
        }
        if (data.processedResults && Array.isArray(data.processedResults)) {
            runtimeState.processedResults = data.processedResults
                .map((item) => normalizeStoredResultItem(item))
                .filter((item): item is BatchResultItem => !!item)
            let needsSave = false
            runtimeState.processedResults.forEach(item => {
                if (item.status === 'success' && (item.size === undefined || item.size === 0)) {
                    let s = 0
                    if (isBatchContentResult(item)) {
                        s += item.content.length
                        item.images.forEach((img) => {
                            s += (img.base64.length * 0.75)
                        })
                    }
                    if (isBatchPdfResult(item)) {
                        s += (item.content.length * 0.75)
                    }
                    if (isBatchArchiveResult(item)) {
                        s += (item.archiveBase64 ? item.archiveBase64.length * 0.75 : 0)
                    }
                    item.size = Math.round(s)
                    needsSave = true
                }
            })
            if (needsSave) saveState()
        }
        if (data.isPaused !== undefined) runtimeState.isPaused = !!data.isPaused

        updateConfiguredConcurrencyFromOptions(runtimeState.BATCH_QUEUE[0]?.options)

        if (data && data.isProcessing && runtimeState.BATCH_QUEUE.length > 0 && !runtimeState.isPaused) {
            void ensureProcessing()
        }
        syncRuntimeState()
        runtimeState.isReady = true
        resolve()
    })
})

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    preparePromise.then(async () => {
        try {
            const response = await handleRuntimeMessage(request)
            if (response !== undefined) {
                sendResponse(response)
            }
        } catch (err: any) {
            sendResponse({ success: false, error: err?.message || String(err) })
        }
    })
    return true
})
