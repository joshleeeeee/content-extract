import type { TaskType } from '../../platformRegistry'
import type {
    BatchQueueItem,
    BatchResultItem,
    BatchResultSummaryItem,
    BatchTaskInput,
    BatchTaskOptions
} from '../models/batch'

export const RUNTIME_ACTIONS = {
    START_BATCH_PROCESS: 'START_BATCH_PROCESS',
    SET_BATCH_CONCURRENCY: 'SET_BATCH_CONCURRENCY',
    GET_BATCH_STATUS: 'GET_BATCH_STATUS',
    GET_FULL_RESULTS: 'GET_FULL_RESULTS',
    PAUSE_BATCH: 'PAUSE_BATCH',
    RESUME_BATCH: 'RESUME_BATCH',
    CLEAR_BATCH_RESULTS: 'CLEAR_BATCH_RESULTS',
    DELETE_BATCH_ITEM: 'DELETE_BATCH_ITEM',
    RETRY_BATCH_ITEM: 'RETRY_BATCH_ITEM',
    RETRY_ALL_FAILED: 'RETRY_ALL_FAILED',
    GENERATE_PDF: 'GENERATE_PDF',
    EXTRACTION_PROGRESS: 'EXTRACTION_PROGRESS'
} as const

export type RuntimeAction = typeof RUNTIME_ACTIONS[keyof typeof RUNTIME_ACTIONS]

export type RuntimeBatchQueueItemInput = BatchTaskInput
export type RuntimeBatchResultItem = BatchResultItem
export type RuntimeBatchResultSummaryItem = BatchResultSummaryItem

export interface RuntimeBaseResponse {
    success: boolean
    error?: string
}

export interface StartBatchProcessRequest {
    action: typeof RUNTIME_ACTIONS.START_BATCH_PROCESS
    items: RuntimeBatchQueueItemInput[]
    format: string
    options?: BatchTaskOptions
}

export interface StartBatchProcessResponse extends RuntimeBaseResponse {
    message?: string
}

export interface SetBatchConcurrencyRequest {
    action: typeof RUNTIME_ACTIONS.SET_BATCH_CONCURRENCY
    value: number
}

export interface SetBatchConcurrencyResponse extends RuntimeBaseResponse {
    configuredConcurrency: number
    effectiveConcurrency: number
}

export interface GetBatchStatusRequest {
    action: typeof RUNTIME_ACTIONS.GET_BATCH_STATUS
}

export interface GetBatchStatusResponse {
    isProcessing: boolean
    isPaused: boolean
    queueLength: number
    results: RuntimeBatchResultSummaryItem[]
    currentItem: BatchQueueItem | null
    activeCount: number
    configuredConcurrency: number
    effectiveConcurrency: number
}

export interface GetFullResultsRequest {
    action: typeof RUNTIME_ACTIONS.GET_FULL_RESULTS
    urls: string[]
}

export interface GetFullResultsResponse extends RuntimeBaseResponse {
    data: RuntimeBatchResultItem[]
}

export interface PauseBatchRequest {
    action: typeof RUNTIME_ACTIONS.PAUSE_BATCH
}

export type PauseBatchResponse = RuntimeBaseResponse

export interface ResumeBatchRequest {
    action: typeof RUNTIME_ACTIONS.RESUME_BATCH
}

export type ResumeBatchResponse = RuntimeBaseResponse

export interface ClearBatchResultsRequest {
    action: typeof RUNTIME_ACTIONS.CLEAR_BATCH_RESULTS
}

export type ClearBatchResultsResponse = RuntimeBaseResponse

export interface DeleteBatchItemRequest {
    action: typeof RUNTIME_ACTIONS.DELETE_BATCH_ITEM
    url: string
}

export type DeleteBatchItemResponse = RuntimeBaseResponse

export interface RetryBatchItemRequest {
    action: typeof RUNTIME_ACTIONS.RETRY_BATCH_ITEM
    url: string
}

export type RetryBatchItemResponse = RuntimeBaseResponse

export interface RetryAllFailedRequest {
    action: typeof RUNTIME_ACTIONS.RETRY_ALL_FAILED
}

export interface RetryAllFailedResponse extends RuntimeBaseResponse {
    count: number
}

export interface GeneratePdfRequest {
    action: typeof RUNTIME_ACTIONS.GENERATE_PDF
    title: string
}

export interface GeneratePdfResponse extends RuntimeBaseResponse {
    data?: string
}

export interface ExtractionProgressEvent {
    action: typeof RUNTIME_ACTIONS.EXTRACTION_PROGRESS
    requestId: string
    platform?: string
    taskType?: TaskType
    message?: string
    total?: number
    round?: number
    added?: number
    maxRounds?: number
    done?: boolean
}

export type RuntimeRequest =
    | StartBatchProcessRequest
    | SetBatchConcurrencyRequest
    | GetBatchStatusRequest
    | GetFullResultsRequest
    | PauseBatchRequest
    | ResumeBatchRequest
    | ClearBatchResultsRequest
    | DeleteBatchItemRequest
    | RetryBatchItemRequest
    | RetryAllFailedRequest
    | GeneratePdfRequest
    | ExtractionProgressEvent

export type RuntimeResponse =
    | StartBatchProcessResponse
    | SetBatchConcurrencyResponse
    | GetBatchStatusResponse
    | GetFullResultsResponse
    | PauseBatchResponse
    | ResumeBatchResponse
    | ClearBatchResultsResponse
    | DeleteBatchItemResponse
    | RetryBatchItemResponse
    | RetryAllFailedResponse
    | GeneratePdfResponse

const runtimeActionSet = new Set<string>(Object.values(RUNTIME_ACTIONS))

export function isRuntimeAction(value: unknown): value is RuntimeAction {
    return typeof value === 'string' && runtimeActionSet.has(value)
}
