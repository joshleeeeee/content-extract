import type { TaskType } from '../../platformRegistry'

export const CONTENT_ACTIONS = {
    EXTRACT_CONTENT: 'EXTRACT_CONTENT',
    EXTRACT_AND_DOWNLOAD_LOCAL: 'EXTRACT_AND_DOWNLOAD_LOCAL',
    EXTRACT_LOCAL_ARCHIVE: 'EXTRACT_LOCAL_ARCHIVE',
    SCAN_LINKS: 'SCAN_LINKS',
    STOP_SCROLL_SCAN: 'STOP_SCROLL_SCAN'
} as const

export const CONTENT_PORTS = {
    SCROLL_SCAN: 'scroll-scan'
} as const

export type ContentAction = typeof CONTENT_ACTIONS[keyof typeof CONTENT_ACTIONS]

export type ExtractFormat = 'markdown' | 'html' | 'csv' | 'json'

export interface ExtractionOptions {
    imageMode?: string
    foreground?: boolean
    scrollWaitTime?: number
    taskType?: TaskType
    extractRequestId?: string
    batchItemTitle?: string
    reviewMinRating?: number
    reviewWithImagesOnly?: boolean
    reviewMaxCount?: number
    reviewRecentDays?: number
    reviewMaxPages?: number
    socialIncludeReplies?: boolean
    socialMaxCount?: number
    socialMaxRounds?: number
    batchConcurrency?: number
    imageConfig?: Record<string, unknown>
    [key: string]: unknown
}

export interface ExtractContentRequest {
    action: typeof CONTENT_ACTIONS.EXTRACT_CONTENT
    format: ExtractFormat | 'html'
    options?: ExtractionOptions
}

export interface ExtractAndDownloadLocalRequest {
    action: typeof CONTENT_ACTIONS.EXTRACT_AND_DOWNLOAD_LOCAL
    format: ExtractFormat
    options?: ExtractionOptions
}

export interface ExtractLocalArchiveRequest {
    action: typeof CONTENT_ACTIONS.EXTRACT_LOCAL_ARCHIVE
    format: ExtractFormat
    options?: ExtractionOptions
}

export interface ScanLinksRequest {
    action: typeof CONTENT_ACTIONS.SCAN_LINKS
}

export interface StopScrollScanRequest {
    action: typeof CONTENT_ACTIONS.STOP_SCROLL_SCAN
}

export type ContentRequest =
    | ExtractContentRequest
    | ExtractAndDownloadLocalRequest
    | ExtractLocalArchiveRequest
    | ScanLinksRequest
    | StopScrollScanRequest

export interface ExtractContentPayload {
    content?: string
    images?: Array<Record<string, unknown>>
    archiveBase64?: string
    archiveStorageKey?: string
    archiveName?: string
    archiveSize?: number
    imageCount?: number
    hasImages?: boolean
}

export interface ContentScriptResponse extends Record<string, unknown> {
    success: boolean
    title?: string
    error?: string
}

export interface ExtractContentResponse extends ContentScriptResponse, ExtractContentPayload {}

export interface ScanLinkItem {
    title: string
    url: string
}

export interface ScanLinksResponse extends ContentScriptResponse {
    links?: ScanLinkItem[]
}

export interface StopScrollScanResponse extends ContentScriptResponse {}

export interface ScrollScanPartialMessage {
    type: 'partial'
    links: ScanLinkItem[]
}

export interface ScrollScanDoneMessage {
    type: 'done'
    links?: ScanLinkItem[]
    total?: number
}

export interface ScrollScanErrorMessage {
    type: 'error'
    error: string
}

export type ScrollScanPortMessage =
    | ScrollScanPartialMessage
    | ScrollScanDoneMessage
    | ScrollScanErrorMessage

const contentActionSet = new Set<string>(Object.values(CONTENT_ACTIONS))

export function isContentAction(value: unknown): value is ContentAction {
    return typeof value === 'string' && contentActionSet.has(value)
}
