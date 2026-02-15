import type { ExportFormat, TaskType } from '../../platformRegistry'

export type BatchStatus = 'pending' | 'processing' | 'success' | 'failed'
export type BatchQueueStatus = 'pending' | 'processing'
export type BatchResultStatus = 'success' | 'failed'
export type BatchResultKind = 'content' | 'archive' | 'pdf'

export interface BatchTaskOptions extends Record<string, unknown> {
    taskType?: TaskType
    imageMode?: string
    foreground?: boolean
    batchConcurrency?: number
    scrollWaitTime?: number
    extractRequestId?: string
    batchItemTitle?: string
    reviewMinRating?: number
    reviewWithImagesOnly?: boolean
    reviewMaxCount?: number
    reviewRecentDays?: number
    reviewMaxPages?: number
    imageConfig?: Record<string, unknown>
}

export interface BatchProgressState {
    progressMessage?: string
    progressTotal?: number
    progressRound?: number
    progressAdded?: number
    progressMaxRounds?: number
    progressStartedAt?: number
    strategyHint?: string
}

export interface BatchScanItem {
    url: string
    title: string
    taskType: TaskType
}

export interface BatchQueueItem extends BatchProgressState {
    url: string
    title: string
    taskType: TaskType
    format: ExportFormat
    options?: BatchTaskOptions
    status: BatchQueueStatus
}

interface BatchResultBase extends BatchProgressState {
    url: string
    title: string
    taskType: TaskType
    format: ExportFormat
    status: BatchResultStatus
    size: number
    timestamp: number
    options?: BatchTaskOptions
}

export interface BatchImageAsset {
    base64: string
    filename: string
}

export interface BatchContentResultItem extends BatchResultBase {
    status: 'success'
    resultKind: 'content'
    content: string
    images: BatchImageAsset[]
}

type ArchiveStorageSource =
    | { archiveBase64: string; archiveStorageKey?: string }
    | { archiveBase64?: string; archiveStorageKey: string }

export type BatchArchiveResultItem = BatchResultBase & ArchiveStorageSource & {
    status: 'success'
    resultKind: 'archive'
    archiveName: string
}

export interface BatchPdfResultItem extends BatchResultBase {
    status: 'success'
    resultKind: 'pdf'
    format: 'pdf'
    content: string
}

export type BatchSuccessResultItem = BatchContentResultItem | BatchArchiveResultItem | BatchPdfResultItem

export interface BatchFailedResultItem extends BatchResultBase {
    status: 'failed'
    error: string
}

export type BatchResultItem = BatchSuccessResultItem | BatchFailedResultItem
export type BatchItem = BatchQueueItem | BatchResultItem

export interface BatchResultSummaryItem {
    url: string
    title: string
    taskType: TaskType
    format: ExportFormat
    status: BatchResultStatus
    size: number
    timestamp: number
    error?: string
}

export interface BatchTaskInput {
    url: string
    title: string
    taskType: TaskType
    format?: ExportFormat
    options?: BatchTaskOptions
}

const EXPORT_FORMATS: readonly ExportFormat[] = ['markdown', 'html', 'pdf', 'csv', 'json'] as const

const RESULT_KINDS: readonly BatchResultKind[] = ['content', 'archive', 'pdf'] as const

const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
}

export function normalizeTaskType(value: unknown): TaskType {
    return value === 'review' ? 'review' : 'doc'
}

export function normalizeExportFormat(value: unknown, taskType: TaskType = 'doc'): ExportFormat {
    const normalized = String(value || '').toLowerCase()
    if ((EXPORT_FORMATS as readonly string[]).includes(normalized)) {
        return normalized as ExportFormat
    }
    return taskType === 'review' ? 'csv' : 'markdown'
}

export function normalizeQueueStatus(value: unknown): BatchQueueStatus {
    return value === 'processing' ? 'processing' : 'pending'
}

export function isBatchResultItem(item: BatchItem): item is BatchResultItem {
    return item.status === 'success' || item.status === 'failed'
}

export function isBatchSuccessItem(item: BatchItem | BatchResultItem): item is BatchSuccessResultItem {
    return item.status === 'success'
}

export function isBatchFailedItem(item: BatchItem | BatchResultItem): item is BatchFailedResultItem {
    return item.status === 'failed'
}

export function isBatchPdfResult(item: BatchResultItem): item is BatchPdfResultItem {
    return item.status === 'success' && item.resultKind === 'pdf'
}

export function isBatchArchiveResult(item: BatchResultItem): item is BatchArchiveResultItem {
    return item.status === 'success' && item.resultKind === 'archive'
}

export function isBatchContentResult(item: BatchResultItem): item is BatchContentResultItem {
    return item.status === 'success' && item.resultKind === 'content'
}

export function isReviewTaskItem(item: { taskType: TaskType }) {
    return item.taskType === 'review'
}

export function inferResultKind(input: unknown): BatchResultKind {
    const record = asRecord(input)
    if (!record) return 'content'

    const existingKind = String(record.resultKind || '').toLowerCase()
    if ((RESULT_KINDS as readonly string[]).includes(existingKind)) {
        return existingKind as BatchResultKind
    }

    const format = String(record.format || '').toLowerCase()
    if (format === 'pdf') return 'pdf'

    if (typeof record.archiveBase64 === 'string' || typeof record.archiveStorageKey === 'string') {
        return 'archive'
    }

    return 'content'
}

export function normalizeStoredQueueItem(value: unknown): BatchQueueItem | null {
    const record = asRecord(value)
    if (!record) return null

    const url = typeof record.url === 'string' ? record.url : ''
    const title = typeof record.title === 'string' ? record.title : ''
    if (!url || !title) return null

    const optionsRecord = asRecord(record.options) as BatchTaskOptions | null
    const taskType = normalizeTaskType(record.taskType ?? optionsRecord?.taskType)

    return {
        url,
        title,
        taskType,
        format: normalizeExportFormat(record.format, taskType),
        options: optionsRecord || undefined,
        status: normalizeQueueStatus(record.status),
        progressMessage: typeof record.progressMessage === 'string' ? record.progressMessage : undefined,
        progressTotal: Number.isFinite(Number(record.progressTotal)) ? Number(record.progressTotal) : undefined,
        progressRound: Number.isFinite(Number(record.progressRound)) ? Number(record.progressRound) : undefined,
        progressAdded: Number.isFinite(Number(record.progressAdded)) ? Number(record.progressAdded) : undefined,
        progressMaxRounds: Number.isFinite(Number(record.progressMaxRounds)) ? Number(record.progressMaxRounds) : undefined,
        progressStartedAt: Number.isFinite(Number(record.progressStartedAt)) ? Number(record.progressStartedAt) : undefined,
        strategyHint: typeof record.strategyHint === 'string' ? record.strategyHint : undefined
    }
}

const toNumberWithFallback = (value: unknown, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

const normalizeImages = (value: unknown): BatchImageAsset[] => {
    if (!Array.isArray(value)) return []

    const images: BatchImageAsset[] = []
    value.forEach((item) => {
        const image = asRecord(item)
        if (!image) return
        const base64 = typeof image.base64 === 'string' ? image.base64 : ''
        const filename = typeof image.filename === 'string' ? image.filename : ''
        if (!base64 || !filename) return
        images.push({ base64, filename })
    })

    return images
}

export function normalizeStoredResultItem(value: unknown): BatchResultItem | null {
    const record = asRecord(value)
    if (!record) return null

    const url = typeof record.url === 'string' ? record.url : ''
    const title = typeof record.title === 'string' ? record.title : ''
    if (!url || !title) return null

    const status = record.status === 'failed' ? 'failed' : (record.status === 'success' ? 'success' : null)
    if (!status) return null

    const optionsRecord = asRecord(record.options) as BatchTaskOptions | null
    const taskType = normalizeTaskType(record.taskType ?? optionsRecord?.taskType)
    const base = {
        url,
        title,
        taskType,
        format: normalizeExportFormat(record.format, taskType),
        size: Math.max(0, Math.round(toNumberWithFallback(record.size, 0))),
        timestamp: Math.max(0, Math.round(toNumberWithFallback(record.timestamp, Date.now()))),
        options: optionsRecord || undefined,
        progressMessage: typeof record.progressMessage === 'string' ? record.progressMessage : undefined,
        progressTotal: Number.isFinite(Number(record.progressTotal)) ? Number(record.progressTotal) : undefined,
        progressRound: Number.isFinite(Number(record.progressRound)) ? Number(record.progressRound) : undefined,
        progressAdded: Number.isFinite(Number(record.progressAdded)) ? Number(record.progressAdded) : undefined,
        progressMaxRounds: Number.isFinite(Number(record.progressMaxRounds)) ? Number(record.progressMaxRounds) : undefined,
        progressStartedAt: Number.isFinite(Number(record.progressStartedAt)) ? Number(record.progressStartedAt) : undefined,
        strategyHint: typeof record.strategyHint === 'string' ? record.strategyHint : undefined
    }

    if (status === 'failed') {
        return {
            ...base,
            status: 'failed',
            error: typeof record.error === 'string' && record.error ? record.error : 'Unknown error'
        }
    }

    const resultKind = inferResultKind(record)
    if (resultKind === 'pdf') {
        return {
            ...base,
            status: 'success',
            resultKind: 'pdf',
            format: 'pdf',
            content: typeof record.content === 'string' ? record.content : ''
        }
    }

    if (resultKind === 'archive') {
        const archiveBase64 = typeof record.archiveBase64 === 'string' ? record.archiveBase64 : undefined
        const archiveStorageKey = typeof record.archiveStorageKey === 'string' ? record.archiveStorageKey : undefined
        if (!archiveBase64 && !archiveStorageKey) return null

        const archiveName = typeof record.archiveName === 'string' && record.archiveName
            ? record.archiveName
            : 'archive.zip'

        if (archiveBase64) {
            return {
                ...base,
                status: 'success',
                resultKind: 'archive',
                archiveBase64,
                archiveStorageKey,
                archiveName
            }
        }

        return {
            ...base,
            status: 'success',
            resultKind: 'archive',
            archiveStorageKey: archiveStorageKey as string,
            archiveName
        }
    }

    return {
        ...base,
        status: 'success',
        resultKind: 'content',
        content: typeof record.content === 'string' ? record.content : '',
        images: normalizeImages(record.images)
    }
}

export function toResultSummaryItem(item: BatchResultItem): BatchResultSummaryItem {
    return {
        url: item.url,
        title: item.title,
        taskType: item.taskType,
        format: item.format,
        status: item.status,
        size: item.size,
        timestamp: item.timestamp,
        error: item.status === 'failed' ? item.error : undefined
    }
}
