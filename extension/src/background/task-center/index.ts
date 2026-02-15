import { RUNTIME_ACTIONS } from '../../shared/contracts/runtime'
import {
    clearBatchResults,
    deleteBatchItem,
    generatePdf,
    pauseBatch,
    resumeBatch,
    retryAllFailed,
    retryBatchItem,
    setBatchConcurrency,
    startBatchProcess
} from './commands'
import { updateExtractionProgress } from './events'
import { getBatchStatus, getFullResults } from './queries'
import type { RuntimeTaskCenterMap } from './types'

export const runtimeTaskCenter: RuntimeTaskCenterMap = {
    [RUNTIME_ACTIONS.START_BATCH_PROCESS]: startBatchProcess,
    [RUNTIME_ACTIONS.SET_BATCH_CONCURRENCY]: setBatchConcurrency,
    [RUNTIME_ACTIONS.GET_BATCH_STATUS]: getBatchStatus,
    [RUNTIME_ACTIONS.GET_FULL_RESULTS]: getFullResults,
    [RUNTIME_ACTIONS.PAUSE_BATCH]: pauseBatch,
    [RUNTIME_ACTIONS.RESUME_BATCH]: resumeBatch,
    [RUNTIME_ACTIONS.CLEAR_BATCH_RESULTS]: clearBatchResults,
    [RUNTIME_ACTIONS.DELETE_BATCH_ITEM]: deleteBatchItem,
    [RUNTIME_ACTIONS.RETRY_BATCH_ITEM]: retryBatchItem,
    [RUNTIME_ACTIONS.RETRY_ALL_FAILED]: retryAllFailed,
    [RUNTIME_ACTIONS.GENERATE_PDF]: generatePdf,
    [RUNTIME_ACTIONS.EXTRACTION_PROGRESS]: updateExtractionProgress
}

export type { RuntimeTaskCenterMap, RuntimeTaskCenterHandler } from './types'
