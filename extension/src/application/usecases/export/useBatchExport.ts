import JSZip from 'jszip'
import { computed, ref, type Ref } from 'vue'
import { sendRuntimeMessage } from '../../../infra/chrome/runtimeClient'
import {
    RUNTIME_ACTIONS,
    type GetFullResultsResponse
} from '../../../shared/contracts/runtime'
import {
    isBatchArchiveResult,
    isBatchContentResult,
    isBatchPdfResult,
    isReviewTaskItem,
    type BatchArchiveResultItem,
    type BatchImageAsset,
    type BatchResultItem,
    type BatchResultSummaryItem
} from '../../../shared/models/batch'

const VOLUME_SIZE_MB = 300
const VOLUME_SIZE_BYTES = VOLUME_SIZE_MB * 1024 * 1024
const MEMORY_WATERLINE_MB = 300
const MEMORY_WATERLINE_BYTES = MEMORY_WATERLINE_MB * 1024 * 1024
const ZIP_HEAP_SOFT_LIMIT_MB = 320
const ZIP_HEAP_HARD_LIMIT_MB = 420

export const MAX_EXPORT_VOLUME_MB = Math.min(VOLUME_SIZE_MB, MEMORY_WATERLINE_MB)

interface BatchStoreLike {
    processedResults: BatchResultSummaryItem[]
}

interface UseBatchExportParams {
    batchStore: BatchStoreLike
    selectedUrls: Ref<Set<string>>
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getHeapUsageMb = () => {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
    if (!mem?.usedJSHeapSize) return null
    return mem.usedJSHeapSize / (1024 * 1024)
}

const getExportFormatMeta = (format: string) => {
    if (format === 'pdf') return { ext: '.pdf', mime: 'application/pdf' }
    if (format === 'html') return { ext: '.html', mime: 'text/html;charset=utf-8' }
    if (format === 'csv') return { ext: '.csv', mime: 'text/csv;charset=utf-8' }
    if (format === 'json') return { ext: '.json', mime: 'application/json;charset=utf-8' }
    return { ext: '.md', mime: 'text/markdown;charset=utf-8' }
}

const encodeExportContent = (format: string, content: string) => {
    if (format === 'csv') {
        return content.startsWith('\uFEFF') ? content : `\uFEFF${content}`
    }
    return content
}

const sanitizeDownloadName = (name?: string) => {
    const raw = name || 'document'
    let safe = raw
        .replace(/[\\/]/g, '_')
        .replace(/[<>:"|?*#%&{}$!@`+=~^]/g, '')
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/^\.+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!safe) safe = 'document'
    if (safe.length > 200) safe = safe.slice(0, 200)
    return safe
}

const normalizeExportTitle = (title?: string) => {
    const raw = (title || '').trim()
    if (!raw) return ''
    return raw
        .replace(/\s*[-|｜]\s*(feishu|lark)\s*docs?$/i, '')
        .replace(/\s*[-|｜]\s*飞书(云)?文档$/i, '')
        .replace(/\s*[-|｜]\s*文档$/i, '')
        .trim()
}

const normalizeBase64Payload = (value: string) => {
    const normalized = String(value || '')
        .trim()
        .replace(/^data:[^;]+;base64,/i, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .replace(/\s+/g, '')

    if (!normalized) return ''
    const remainder = normalized.length % 4
    if (remainder === 0) return normalized
    return normalized + '='.repeat(4 - remainder)
}

const base64ToBytes = (value: string) => {
    const normalized = normalizeBase64Payload(value)
    if (!normalized) {
        throw new Error('空的 Base64 数据')
    }

    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('Blob 转 DataURL 失败'))
        reader.readAsDataURL(blob)
    })
}

const downloadByUrl = (url: string, filename: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url,
            filename,
            conflictAction: 'uniquify'
        }, (downloadId) => {
            const err = chrome.runtime.lastError
            if (err || !downloadId) {
                reject(new Error(err?.message || '下载失败'))
                return
            }
            resolve()
        })
    })
}

const triggerDownloadByAnchor = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

const triggerDownload = async (blob: Blob, filename: string) => {
    if (blob.size <= 8 * 1024 * 1024) {
        try {
            const dataUrl = await blobToDataUrl(blob)
            await downloadByUrl(dataUrl, filename)
            return
        } catch (e) {
            console.warn('[Download] DataURL fallback failed, switch to blob URL', e)
        }
    }

    const dlUrl = URL.createObjectURL(blob)
    try {
        await downloadByUrl(dlUrl, filename)
    } catch (e) {
        console.warn('[Download] downloads API failed, fallback anchor click', e)
        triggerDownloadByAnchor(dlUrl, filename)
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(dlUrl), 120_000)
    }
}

const fetchArchiveBase64ByKey = (key: string): Promise<string | null> => {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (res) => {
            resolve((res && typeof res[key] === 'string') ? res[key] : null)
        })
    })
}

const toExportImages = (images: BatchImageAsset[]) => {
    return images.filter((img) => !!img.base64 && !!img.filename)
}

const recoverTextFromArchive = async (item: BatchArchiveResultItem): Promise<string> => {
    const archiveBase64 = item.archiveBase64 || (item.archiveStorageKey ? await fetchArchiveBase64ByKey(item.archiveStorageKey) : null)
    if (!archiveBase64) return ''

    try {
        const archiveZip = await JSZip.loadAsync(base64ToBytes(archiveBase64))
        const files = Object.values(archiveZip.files).filter(file => !file.dir)
        if (files.length === 0) return ''

        const preferredExt = item.format === 'json' ? '.json' : (item.format === 'csv' ? '.csv' : '')
        const preferredFile = preferredExt
            ? files.find(file => file.name.toLowerCase().endsWith(preferredExt))
            : null
        const targetFile = preferredFile || files[0]
        if (!targetFile) return ''

        return await targetFile.async('string')
    } catch (e) {
        console.warn('[Download] Recover text from archive failed', e)
        return ''
    }
}

const isPureReviewFileSelection = (items: BatchResultSummaryItem[]) => {
    return items.length > 0 && items.every((item) => {
        return isReviewTaskItem(item) && (item.format === 'csv' || item.format === 'json')
    })
}

const createVolumes = (items: BatchResultSummaryItem[]) => {
    const groups: BatchResultSummaryItem[][] = []
    let currentGroup: BatchResultSummaryItem[] = []
    let currentSize = 0

    for (const item of items) {
        const itemSize = item.size || 0
        const maxChunkBytes = Math.min(VOLUME_SIZE_BYTES, MEMORY_WATERLINE_BYTES)
        if (currentGroup.length > 0 && currentSize + itemSize > maxChunkBytes) {
            groups.push(currentGroup)
            currentGroup = [item]
            currentSize = itemSize
        } else {
            currentGroup.push(item)
            currentSize += itemSize
        }
    }

    if (currentGroup.length > 0) groups.push(currentGroup)
    return groups
}

const getSafeTitle = (item: { title: string }) => {
    return sanitizeDownloadName(normalizeExportTitle(item.title) || item.title || 'document')
}

export const formatSize = (bytes: number = 0) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function useBatchExport({ batchStore, selectedUrls }: UseBatchExportParams) {
    const isDownloading = ref(false)
    const downloadProgress = ref('')

    const selectedSuccessItems = computed(() => {
        return batchStore.processedResults.filter(r => selectedUrls.value.has(r.url) && r.status === 'success')
    })

    const totalSelectedSize = computed(() => {
        let total = 0
        batchStore.processedResults.forEach((item) => {
            if (selectedUrls.value.has(item.url)) {
                total += item.size || 0
            }
        })
        return total
    })

    const volumes = computed(() => createVolumes(selectedSuccessItems.value))
    const volumeCount = computed(() => volumes.value.length)

    const fetchSingleResult = async (url: string): Promise<BatchResultItem | null> => {
        try {
            const response = await sendRuntimeMessage<GetFullResultsResponse>({
                action: RUNTIME_ACTIONS.GET_FULL_RESULTS,
                urls: [url]
            })
            if (response?.success && Array.isArray(response.data) && response.data.length > 0) {
                return response.data[0]
            }
            return null
        } catch (_) {
            return null
        }
    }

    const downloadReviewItemsAsFiles = async (items: BatchResultSummaryItem[]) => {
        for (let i = 0; i < items.length; i++) {
            const source = items[i]
            downloadProgress.value = `正在导出评论文件 ${i + 1}/${items.length}...`

            const item = await fetchSingleResult(source.url)
            if (!item || item.status !== 'success') continue

            const safeTitle = getSafeTitle(item)
            const formatMeta = getExportFormatMeta(item.format)

            let content = ''
            if (isBatchContentResult(item)) {
                content = item.content
            }
            if (!content && isBatchArchiveResult(item)) {
                content = await recoverTextFromArchive(item)
            }

            const blob = new Blob([encodeExportContent(item.format, content)], { type: formatMeta.mime })
            await triggerDownload(blob, `${safeTitle}${formatMeta.ext}`)
            await delay(180)
        }
    }

    const handleDownloadZip = async () => {
        const selectedItems = selectedSuccessItems.value
        if (isPureReviewFileSelection(selectedItems)) {
            isDownloading.value = true
            try {
                await downloadReviewItemsAsFiles(selectedItems)
            } finally {
                isDownloading.value = false
                downloadProgress.value = ''
            }
            return
        }

        const volumeItems = volumes.value.map(group => [...group])
        if (volumeItems.length === 0) return

        isDownloading.value = true
        const timestamp = Date.now()

        try {
            for (let vi = 0; vi < volumeItems.length; vi++) {
                const volume = volumeItems[vi]
                const zip = new JSZip()
                const imagesFolder = zip.folder('images')
                let shouldSplitEarly = false

                for (let fi = 0; fi < volume.length; fi++) {
                    const totalIndex = volumeItems.slice(0, vi).reduce((sum, group) => sum + group.length, 0) + fi + 1
                    const totalItems = volumeItems.reduce((sum, group) => sum + group.length, 0)
                    downloadProgress.value = volumeItems.length > 1
                        ? `卷${vi + 1}/${volumeItems.length} · 第 ${totalIndex}/${totalItems} 个`
                        : `第 ${fi + 1}/${volume.length} 个...`

                    const item = await fetchSingleResult(volume[fi].url)
                    if (!item || item.status !== 'success') continue

                    const safeTitle = getSafeTitle(item)

                    if (isBatchPdfResult(item)) {
                        zip.file(`${safeTitle}.pdf`, base64ToBytes(item.content))
                    } else if (isBatchArchiveResult(item)) {
                        const archiveBase64 = item.archiveBase64 || (item.archiveStorageKey ? await fetchArchiveBase64ByKey(item.archiveStorageKey) : null)
                        if (archiveBase64) {
                            zip.file(`${safeTitle}.zip`, base64ToBytes(archiveBase64))
                        }
                    } else if (isBatchContentResult(item)) {
                        const formatMeta = getExportFormatMeta(item.format)
                        zip.file(`${safeTitle}${formatMeta.ext}`, encodeExportContent(item.format, item.content))

                        if (item.format === 'markdown' || item.format === 'html') {
                            const images = toExportImages(item.images)
                            images.forEach((img) => {
                                const base64Data = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64
                                imagesFolder?.file(img.filename, base64Data, { base64: true })
                            })
                        }
                    }

                    const heapMb = getHeapUsageMb()
                    if (heapMb && heapMb > ZIP_HEAP_SOFT_LIMIT_MB) {
                        await delay(250)
                    }
                    if (heapMb && heapMb > ZIP_HEAP_HARD_LIMIT_MB && fi < volume.length - 1) {
                        shouldSplitEarly = true
                        const remaining = volume.slice(fi + 1)
                        if (remaining.length > 0) {
                            volumeItems.splice(vi + 1, 0, remaining)
                        }
                        break
                    }
                }

                downloadProgress.value = volumeItems.length > 1
                    ? `正在打包卷 ${vi + 1}...`
                    : '正在打包...'

                const blob = await zip.generateAsync({ type: 'blob' })
                const filename = volumeItems.length > 1
                    ? `Batch_Export_${timestamp}_Vol${vi + 1}.zip`
                    : `Batch_Export_${timestamp}.zip`
                await triggerDownload(blob, filename)

                if (vi < volumeItems.length - 1) {
                    await delay(shouldSplitEarly ? 2000 : 1500)
                }
            }
        } finally {
            isDownloading.value = false
            downloadProgress.value = ''
        }
    }

    const handleSingleDownload = async (item: BatchResultSummaryItem) => {
        const data = await fetchSingleResult(item.url)
        if (!data || data.status !== 'success') return

        const safeTitle = getSafeTitle(data)

        if (isBatchPdfResult(data)) {
            const blob = new Blob([base64ToBytes(data.content)], { type: 'application/pdf' })
            await triggerDownload(blob, `${safeTitle}.pdf`)
            return
        }

        if (isBatchArchiveResult(data)) {
            const archiveBase64 = data.archiveBase64 || (data.archiveStorageKey ? await fetchArchiveBase64ByKey(data.archiveStorageKey) : null)
            if (!archiveBase64) return
            const blob = new Blob([base64ToBytes(archiveBase64)], { type: 'application/zip' })
            await triggerDownload(blob, `${safeTitle}.zip`)
            return
        }

        if (!isBatchContentResult(data)) return

        const formatMeta = getExportFormatMeta(data.format)
        const hasImages = (data.format === 'markdown' || data.format === 'html') && data.images.length > 0

        if (hasImages) {
            const zip = new JSZip()
            zip.file(`${safeTitle}${formatMeta.ext}`, encodeExportContent(data.format, data.content))

            const imagesFolder = zip.folder('images')
            const images = toExportImages(data.images)
            images.forEach((img) => {
                const base64Data = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64
                imagesFolder?.file(img.filename, base64Data, { base64: true })
            })

            const blob = await zip.generateAsync({ type: 'blob' })
            await triggerDownload(blob, `${safeTitle}.zip`)
            return
        }

        const blob = new Blob([encodeExportContent(data.format, data.content)], { type: formatMeta.mime })
        await triggerDownload(blob, `${safeTitle}${formatMeta.ext}`)
    }

    return {
        volumeSizeMb: MAX_EXPORT_VOLUME_MB,
        isDownloading,
        downloadProgress,
        totalSelectedSize,
        volumeCount,
        fetchSingleResult,
        handleDownloadZip,
        handleSingleDownload
    }
}
