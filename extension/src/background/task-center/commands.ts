import { generatePDF } from '../pdf'
import { cancelActiveTasks, ensureProcessing } from '../processor'
import {
    collectArchiveStorageKeys,
    getConfiguredConcurrency,
    getEffectiveConcurrency,
    syncRuntimeState,
    updateConfiguredConcurrency,
    updateConfiguredConcurrencyFromOptions
} from '../runtime'
import { runtimeState } from '../state'
import { removeStorageKeys, saveState } from '../storage'
import { getBatchItemKey, normalizeExportFormat, normalizeJobId, normalizeTaskType, type BatchQueueItem } from '../types'
import type {
    ClearBatchResultsRequest,
    ClearBatchResultsResponse,
    DeleteBatchItemRequest,
    DeleteBatchItemResponse,
    GeneratePdfRequest,
    GeneratePdfResponse,
    PauseBatchRequest,
    PauseBatchResponse,
    ResumeBatchRequest,
    ResumeBatchResponse,
    RetryAllFailedRequest,
    RetryAllFailedResponse,
    RetryBatchItemRequest,
    RetryBatchItemResponse,
    SetBatchConcurrencyRequest,
    SetBatchConcurrencyResponse,
    SetBatchWindowCountRequest,
    SetBatchWindowCountResponse,
    SetBatchWindowModeRequest,
    SetBatchWindowModeResponse,
    StartBatchProcessRequest,
    StartBatchProcessResponse
} from '../../shared/contracts/runtime'

const matchesTaskRequest = (item: { jobId: string; url: string }, request: { jobId?: string; url?: string }) => {
    if (request.jobId) return item.jobId === request.jobId
    if (request.url) return item.url === request.url
    return false
}

export async function startBatchProcess(request: StartBatchProcessRequest): Promise<StartBatchProcessResponse> {
    const { items, format, options } = request
    if (!items || !items.length) {
        return { success: false, error: 'No Items' }
    }

    updateConfiguredConcurrencyFromOptions(options)

    items.forEach((item) => {
        const jobId = normalizeJobId(item.jobId, item.url)
        const taskKey = getBatchItemKey({ jobId, url: item.url })
        const isInQueue = runtimeState.BATCH_QUEUE.some(q => getBatchItemKey(q) === taskKey)
        const isCurrent = runtimeState.activeTasks.has(taskKey)
        if (!isInQueue && !isCurrent) {
            const taskType = normalizeTaskType(item.taskType ?? options?.taskType)
            const queueItem: BatchQueueItem = {
                jobId,
                url: item.url,
                title: item.title,
                taskType,
                format: normalizeExportFormat(item.format || format, taskType),
                options,
                status: 'pending'
            }
            runtimeState.BATCH_QUEUE.push(queueItem)
        }
    })

    runtimeState.isPaused = false
    await ensureProcessing()
    return { success: true, message: 'Started' }
}

export async function setBatchConcurrency(request: SetBatchConcurrencyRequest): Promise<SetBatchConcurrencyResponse> {
    updateConfiguredConcurrency(request.value)
    await ensureProcessing()
    return {
        success: true,
        configuredConcurrency: getConfiguredConcurrency(),
        effectiveConcurrency: getEffectiveConcurrency()
    }
}

export async function setBatchWindowMode(request: SetBatchWindowModeRequest): Promise<SetBatchWindowModeResponse> {
    runtimeState.useWindowMode = request.value
    return { success: true }
}

export async function setBatchWindowCount(request: SetBatchWindowCountRequest): Promise<SetBatchWindowCountResponse> {
    runtimeState.windowPoolSize = Math.max(1, Math.min(4, request.value))
    return { success: true }
}

export async function pauseBatch(_request: PauseBatchRequest): Promise<PauseBatchResponse> {
    runtimeState.isPaused = true
    await cancelActiveTasks()
    syncRuntimeState()
    await saveState()
    return { success: true }
}

export async function resumeBatch(_request: ResumeBatchRequest): Promise<ResumeBatchResponse> {
    runtimeState.isPaused = false
    await ensureProcessing()
    return { success: true }
}

export async function clearBatchResults(_request: ClearBatchResultsRequest): Promise<ClearBatchResultsResponse> {
    await cancelActiveTasks()
    await removeStorageKeys(collectArchiveStorageKeys(runtimeState.processedResults))
    runtimeState.processedResults = []
    runtimeState.BATCH_QUEUE = []
    runtimeState.isPaused = false
    runtimeState.activeTasks.clear()
    runtimeState.cancelledTaskKeys.clear()
    syncRuntimeState()
    await saveState()
    return { success: true }
}

export async function deleteBatchItem(request: DeleteBatchItemRequest): Promise<DeleteBatchItemResponse> {
    if (!request.jobId && !request.url) {
        return { success: false, error: 'Missing jobId or url' }
    }

    const taskKey = request.jobId || request.url || ''
    const targets = runtimeState.processedResults.filter(item => matchesTaskRequest(item, request))
    await removeStorageKeys(collectArchiveStorageKeys(targets))
    runtimeState.processedResults = runtimeState.processedResults.filter(item => !matchesTaskRequest(item, request))
    runtimeState.BATCH_QUEUE = runtimeState.BATCH_QUEUE.filter(item => !matchesTaskRequest(item, request))

    const running = runtimeState.activeTasks.get(taskKey)
    if (running) {
        runtimeState.cancelledTaskKeys.add(taskKey)
        if (running.tabId) {
            try { await chrome.tabs.remove(running.tabId) } catch (_) { }
        }
    }

    syncRuntimeState()
    await saveState()
    return { success: true }
}

export async function retryBatchItem(request: RetryBatchItemRequest): Promise<RetryBatchItemResponse> {
    if (!request.jobId && !request.url) {
        return { success: false, error: 'Missing jobId or url' }
    }

    const failedItem = runtimeState.processedResults.find(r => matchesTaskRequest(r, request) && r.status === 'failed')
    if (!failedItem) {
        return { success: false, error: 'Item not found or not failed' }
    }

    runtimeState.processedResults = runtimeState.processedResults.filter(r => !matchesTaskRequest(r, request))
    const taskType = normalizeTaskType(failedItem.taskType || failedItem.options?.taskType)
    runtimeState.BATCH_QUEUE.push({
        jobId: failedItem.jobId,
        url: failedItem.url,
        title: failedItem.title,
        taskType,
        format: normalizeExportFormat(failedItem.format, taskType),
        options: failedItem.options,
        status: 'pending'
    })
    runtimeState.isPaused = false
    updateConfiguredConcurrencyFromOptions(failedItem.options)
    await ensureProcessing()
    return { success: true }
}

export async function retryAllFailed(_request: RetryAllFailedRequest): Promise<RetryAllFailedResponse> {
    const failedItems = runtimeState.processedResults.filter(r => r.status === 'failed')
    if (failedItems.length > 0) {
        runtimeState.processedResults = runtimeState.processedResults.filter(r => r.status !== 'failed')
        failedItems.forEach((item) => {
            const taskType = normalizeTaskType(item.taskType || item.options?.taskType)
            runtimeState.BATCH_QUEUE.push({
                jobId: item.jobId,
                url: item.url,
                title: item.title,
                taskType,
                format: normalizeExportFormat(item.format, taskType),
                options: item.options,
                status: 'pending'
            })
        })
        runtimeState.isPaused = false
        if (failedItems[0]) {
            updateConfiguredConcurrencyFromOptions(failedItems[0].options)
        }
        await ensureProcessing()
    }

    return { success: true, count: failedItems.length }
}

export async function generatePdf(request: GeneratePdfRequest): Promise<GeneratePdfResponse> {
    return await generatePDF(request.title)
}
