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
import { normalizeExportFormat, normalizeTaskType, type BatchQueueItem } from '../types'
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
    StartBatchProcessRequest,
    StartBatchProcessResponse
} from '../../shared/contracts/runtime'

export async function startBatchProcess(request: StartBatchProcessRequest): Promise<StartBatchProcessResponse> {
    const { items, format, options } = request
    if (!items || !items.length) {
        return { success: false, error: 'No Items' }
    }

    updateConfiguredConcurrencyFromOptions(options)

    items.forEach((item) => {
        const isInQueue = runtimeState.BATCH_QUEUE.some(q => q.url === item.url)
        const isCurrent = runtimeState.activeTasks.has(item.url)
        if (!isInQueue && !isCurrent) {
            const taskType = normalizeTaskType(item.taskType ?? options?.taskType)
            const queueItem: BatchQueueItem = {
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
    runtimeState.cancelledTaskUrls.clear()
    syncRuntimeState()
    await saveState()
    return { success: true }
}

export async function deleteBatchItem(request: DeleteBatchItemRequest): Promise<DeleteBatchItemResponse> {
    const { url } = request
    const targets = runtimeState.processedResults.filter(item => item.url === url)
    await removeStorageKeys(collectArchiveStorageKeys(targets))
    runtimeState.processedResults = runtimeState.processedResults.filter(item => item.url !== url)
    runtimeState.BATCH_QUEUE = runtimeState.BATCH_QUEUE.filter(item => item.url !== url)

    const running = runtimeState.activeTasks.get(url)
    if (running) {
        runtimeState.cancelledTaskUrls.add(url)
        if (running.tabId) {
            try { await chrome.tabs.remove(running.tabId) } catch (_) { }
        }
    }

    syncRuntimeState()
    await saveState()
    return { success: true }
}

export async function retryBatchItem(request: RetryBatchItemRequest): Promise<RetryBatchItemResponse> {
    const { url } = request
    const failedItem = runtimeState.processedResults.find(r => r.url === url && r.status === 'failed')
    if (!failedItem) {
        return { success: false, error: 'Item not found or not failed' }
    }

    runtimeState.processedResults = runtimeState.processedResults.filter(r => r.url !== url)
    const taskType = normalizeTaskType(failedItem.taskType || failedItem.options?.taskType)
    runtimeState.BATCH_QUEUE.push({
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
