export type {
    BatchArchiveResultItem,
    BatchContentResultItem,
    BatchFailedResultItem,
    BatchImageAsset,
    BatchItem,
    BatchProgressState,
    BatchQueueItem,
    BatchResultItem,
    BatchResultKind,
    BatchResultSummaryItem,
    BatchScanItem,
    BatchSuccessResultItem,
    BatchTaskInput,
    BatchTaskOptions
} from '../shared/models/batch'

export {
    getBatchItemKey,
    inferResultKind,
    isBatchArchiveResult,
    isBatchContentResult,
    isBatchFailedItem,
    isBatchPdfResult,
    isBatchResultItem,
    isBatchSuccessItem,
    isReviewTaskItem,
    normalizeJobId,
    normalizeExportFormat,
    normalizeStoredQueueItem,
    normalizeStoredResultItem,
    normalizeTaskType,
    toResultSummaryItem
} from '../shared/models/batch'
