import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ExportFormat } from '../platformRegistry'
import { sendRuntimeMessage } from '../infra/chrome/runtimeClient'
import type {
    BatchQueueItem,
    BatchResultSummaryItem,
    BatchScanItem,
    BatchTaskOptions
} from '../shared/models/batch'
import {
    RUNTIME_ACTIONS,
    type GetBatchStatusResponse,
    type RuntimeBatchQueueItemInput
} from '../shared/contracts/runtime'

export type BatchItem = BatchResultSummaryItem
export type BatchScanListItem = BatchScanItem

export const useBatchStore = defineStore('batch', () => {
    const scannedLinks = ref<BatchScanListItem[]>([])
    const processedResults = ref<BatchResultSummaryItem[]>([])
    const isProcessing = ref(false)
    const isPaused = ref(false)
    const currentItem = ref<BatchQueueItem | null>(null)
    const queueLength = ref(0)
    const progressPercent = ref(0)
    const activeCount = ref(0)
    const effectiveConcurrency = ref(1)
    const isUpdatingStatus = ref(false)
    const hasLoadedStatus = ref(false)
    const isPausing = ref(false)
    const isResuming = ref(false)
    const isRetryingAll = ref(false)
    const retryingUrls = ref<Set<string>>(new Set())

    const updateStatus = async () => {
        isUpdatingStatus.value = true
        try {
            const res = await sendRuntimeMessage<GetBatchStatusResponse>({ action: RUNTIME_ACTIONS.GET_BATCH_STATUS })
            if (res) {
                isProcessing.value = res.isProcessing
                isPaused.value = res.isPaused
                processedResults.value = (res.results || []) as BatchResultSummaryItem[]
                currentItem.value = (res.currentItem || null) as BatchQueueItem | null
                queueLength.value = res.queueLength || 0
                activeCount.value = res.activeCount || 0
                effectiveConcurrency.value = res.effectiveConcurrency || 1

                const finishedCount = processedResults.value.length
                const total = finishedCount + activeCount.value + queueLength.value
                progressPercent.value = total > 0 ? (finishedCount / total) * 100 : 0
            }
        } catch (_) {
            // ignore transient runtime wake-up failures
        } finally {
            hasLoadedStatus.value = true
            isUpdatingStatus.value = false
        }
    }

    const startBatch = async (items: BatchScanListItem[], format: ExportFormat, options: BatchTaskOptions) => {
        const payload: RuntimeBatchQueueItemInput[] = items.map((item) => ({
            url: item.url,
            title: item.title,
            taskType: item.taskType,
            format,
            options
        }))
        await sendRuntimeMessage({
            action: RUNTIME_ACTIONS.START_BATCH_PROCESS,
            items: payload,
            format,
            options
        })
        await updateStatus()
    }

    const pauseBatch = async () => {
        if (isPausing.value) return
        isPausing.value = true
        // Optimistic update to avoid perceived freeze.
        isPaused.value = true
        try {
            await sendRuntimeMessage({ action: RUNTIME_ACTIONS.PAUSE_BATCH })
            await updateStatus()
        } finally {
            isPausing.value = false
        }
    }

    const resumeBatch = async () => {
        if (isResuming.value) return
        isResuming.value = true
        // Optimistic update to avoid perceived freeze.
        isPaused.value = false
        try {
            await sendRuntimeMessage({ action: RUNTIME_ACTIONS.RESUME_BATCH })
            await updateStatus()
        } finally {
            isResuming.value = false
        }
    }

    const clearResults = async () => {
        await sendRuntimeMessage({ action: RUNTIME_ACTIONS.CLEAR_BATCH_RESULTS })
        processedResults.value = []
        await updateStatus()
    }

    const retryItem = async (url: string) => {
        const next = new Set(retryingUrls.value)
        next.add(url)
        retryingUrls.value = next
        try {
            await sendRuntimeMessage({ action: RUNTIME_ACTIONS.RETRY_BATCH_ITEM, url })
            await updateStatus()
        } finally {
            const done = new Set(retryingUrls.value)
            done.delete(url)
            retryingUrls.value = done
        }
    }

    const retryAllFailed = async () => {
        if (isRetryingAll.value) return
        isRetryingAll.value = true
        try {
            await sendRuntimeMessage({ action: RUNTIME_ACTIONS.RETRY_ALL_FAILED })
            await updateStatus()
        } finally {
            isRetryingAll.value = false
        }
    }

    return {
        scannedLinks,
        processedResults,
        isProcessing,
        isPaused,
        currentItem,
        queueLength,
        progressPercent,
        activeCount,
        effectiveConcurrency,
        isUpdatingStatus,
        hasLoadedStatus,
        isPausing,
        isResuming,
        isRetryingAll,
        retryingUrls,
        updateStatus,
        startBatch,
        pauseBatch,
        resumeBatch,
        clearResults,
        retryItem,
        retryAllFailed
    }
})
