import {
    getConfiguredConcurrency,
    getEffectiveConcurrency
} from '../runtime'
import { runtimeState } from '../state'
import { toResultSummaryItem } from '../types'
import type {
    GetBatchStatusRequest,
    GetBatchStatusResponse,
    GetFullResultsRequest,
    GetFullResultsResponse
} from '../../shared/contracts/runtime'

export async function getBatchStatus(_request: GetBatchStatusRequest): Promise<GetBatchStatusResponse> {
    const lightResults = runtimeState.processedResults.map((item) => toResultSummaryItem(item))
    const activeItems = Array.from(runtimeState.activeTasks.values()).map((entry) => entry.item)

    return {
        isProcessing: runtimeState.isProcessing,
        isPaused: runtimeState.isPaused,
        queueLength: runtimeState.BATCH_QUEUE.length,
        results: lightResults,
        currentItem: runtimeState.currentItem,
        activeCount: runtimeState.activeTasks.size,
        configuredConcurrency: getConfiguredConcurrency(),
        effectiveConcurrency: getEffectiveConcurrency(),
        queueItems: [...runtimeState.BATCH_QUEUE],
        activeItems
    }
}

export async function getFullResults(request: GetFullResultsRequest): Promise<GetFullResultsResponse> {
    const urls = Array.isArray(request.urls) ? request.urls : []
    const jobIds = Array.isArray(request.jobIds) ? request.jobIds : []
    const fullItems = runtimeState.processedResults.filter(r => jobIds.includes(r.jobId) || urls.includes(r.url))
    return { success: true, data: fullItems }
}
