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

    return {
        isProcessing: runtimeState.isProcessing,
        isPaused: runtimeState.isPaused,
        queueLength: runtimeState.BATCH_QUEUE.length,
        results: lightResults,
        currentItem: runtimeState.currentItem,
        activeCount: runtimeState.activeTasks.size,
        configuredConcurrency: getConfiguredConcurrency(),
        effectiveConcurrency: getEffectiveConcurrency()
    }
}

export async function getFullResults(request: GetFullResultsRequest): Promise<GetFullResultsResponse> {
    const fullItems = runtimeState.processedResults.filter(r => request.urls.includes(r.url))
    return { success: true, data: fullItems }
}
