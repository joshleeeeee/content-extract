import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface BatchItem {
    url: string
    title: string
    status?: 'pending' | 'processing' | 'success' | 'failed'
    size?: number
}

export const useBatchStore = defineStore('batch', () => {
    const scannedLinks = ref<BatchItem[]>([])
    const processedResults = ref<BatchItem[]>([])
    const isProcessing = ref(false)
    const isPaused = ref(false)
    const currentItem = ref<BatchItem | null>(null)
    const queueLength = ref(0)
    const progressPercent = ref(0)

    const updateStatus = async () => {
        return new Promise<void>((resolve) => {
            chrome.runtime.sendMessage({ action: 'GET_BATCH_STATUS' }, (res) => {
                if (res) {
                    isProcessing.value = res.isProcessing
                    isPaused.value = res.isPaused
                    processedResults.value = res.results || []
                    currentItem.value = res.currentItem || null
                    queueLength.value = res.queueLength || 0

                    const finishedCount = processedResults.value.length
                    const activeCount = currentItem.value ? 1 : 0
                    const total = finishedCount + activeCount + queueLength.value

                    progressPercent.value = total > 0 ? (finishedCount / total) * 100 : 0
                }
                resolve()
            })
        })
    }

    const startBatch = (items: BatchItem[], format: string, options: any) => {
        chrome.runtime.sendMessage({
            action: 'START_BATCH_PROCESS',
            items,
            format,
            options
        }, () => updateStatus())
    }

    const pauseBatch = () => {
        chrome.runtime.sendMessage({ action: 'PAUSE_BATCH' }, () => updateStatus())
    }

    const resumeBatch = () => {
        chrome.runtime.sendMessage({ action: 'RESUME_BATCH' }, () => updateStatus())
    }

    const clearResults = () => {
        chrome.runtime.sendMessage({ action: 'CLEAR_BATCH_RESULTS' }, () => {
            processedResults.value = []
            updateStatus()
        })
    }

    return {
        scannedLinks,
        processedResults,
        isProcessing,
        isPaused,
        currentItem,
        queueLength,
        progressPercent,
        updateStatus,
        startBatch,
        pauseBatch,
        resumeBatch,
        clearResults
    }
})
