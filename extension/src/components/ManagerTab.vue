<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBatchStore, type BatchItem } from '../store/batch'
import JSZip from 'jszip'

const batchStore = useBatchStore()
const selectedUrls = ref<Set<string>>(new Set())

const MAX_ZIP_SIZE_MB = 300

const formatSize = (bytes: number = 0) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const totalSelectedSize = computed(() => {
  let total = 0
  batchStore.processedResults.forEach(r => {
    if (selectedUrls.value.has(r.url)) {
      total += r.size || 0
    }
  })
  return total
})

const isLimitExceeded = computed(() => totalSelectedSize.value > MAX_ZIP_SIZE_MB * 1024 * 1024)

const toggleSelectAll = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    batchStore.processedResults.forEach(r => {
      if (r.status === 'success') selectedUrls.value.add(r.url)
    })
  } else {
    selectedUrls.value.clear()
  }
}

const handleDownloadZip = async () => {
    const zip = new JSZip()
    const selectedResults = batchStore.processedResults.filter(r => selectedUrls.value.has(r.url))
    
    // In a real scenario, the background script stores the content. 
    // For the migration, we assume the results in the store might need to be fetched 
    // or are already available if recently processed.
    // However, the original logic in popup.js suggests it relies on background state.
    
    // We send a message to background to get the full data for selected items
    chrome.runtime.sendMessage({ 
        action: 'GET_FULL_RESULTS', 
        urls: Array.from(selectedUrls.value) 
    }, async (response) => {
        if (response && response.success) {
            const data = response.data
            const imagesFolder = zip.folder("images")

            data.forEach((item: any) => {
                const safeTitle = (item.title || 'document').replace(/[\\/:*?"<>|]/g, "_")
                const filename = `${safeTitle}.md`
                zip.file(filename, item.content || '')

                // Process images if any
                if (item.images && Array.isArray(item.images)) {
                    item.images.forEach((img: any) => {
                        if (img.base64 && img.filename) {
                            // data:image/png;base64,.... -> take the part after comma
                            const base64Data = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64;
                            imagesFolder?.file(img.filename, base64Data, { base64: true })
                        }
                    })
                }
            })

            const blob = await zip.generateAsync({ type: "blob" })
            const dlUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = dlUrl
            a.download = `Batch_Export_${new Date().getTime()}.zip`
            a.click()
            URL.revokeObjectURL(dlUrl)
        }
    })
}

const handleClear = () => {
  if (confirm('确定要清空所有已下载的历史记录吗？正在进行的任务也会停止。')) {
    batchStore.clearResults()
    selectedUrls.value.clear()
  }
}

const deleteItem = (url: string) => {
  chrome.runtime.sendMessage({ action: 'DELETE_BATCH_ITEM', url }, () => {
    batchStore.updateStatus()
    selectedUrls.value.delete(url)
  })
}

const openUrl = (url: string) => window.open(url, '_blank')

const handleSingleDownload = async (item: BatchItem) => {
    chrome.runtime.sendMessage({ 
        action: 'GET_FULL_RESULTS', 
        urls: [item.url]
    }, async (response) => {
        if (response && response.success && response.data.length > 0) {
            const data = response.data[0]
            const safeTitle = (data.title || 'document').replace(/[\\/:*?"<>|]/g, "_")
            
            const hasImages = data.images && data.images.length > 0
            
            if (hasImages) {
                // Download as ZIP if images exist
                const zip = new JSZip()
                const ext = '.md' // Batch currently only supports MD export in this view
                zip.file(`${safeTitle}${ext}`, data.content || '')
                
                const imagesFolder = zip.folder("images")
                data.images.forEach((img: any) => {
                    if (img.base64 && img.filename) {
                        const base64Data = img.base64.includes(',') ? img.base64.split(',')[1] : img.base64;
                        imagesFolder?.file(img.filename, base64Data, { base64: true })
                    }
                })

                const blob = await zip.generateAsync({ type: "blob" })
                const dlUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = dlUrl
                a.download = `${safeTitle}.zip`
                a.click()
                URL.revokeObjectURL(dlUrl)
            } else {
                // Download file directly if no images
                const blob = new Blob([data.content || ''], { type: 'text/markdown' })
                const dlUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = dlUrl
                a.download = `${safeTitle}.md`
                a.click()
                URL.revokeObjectURL(dlUrl)
            }
        }
    })
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Summary Header -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-bold text-gray-400 mb-1">完成总量</div>
        <div class="text-xl font-black text-blue-600">{{ batchStore.processedResults.filter(r => r.status === 'success').length }}</div>
      </div>
      <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-bold text-gray-400 mb-1">已选大小</div>
        <div :class="[isLimitExceeded ? 'text-red-500' : 'text-gray-700 dark:text-gray-200']" class="text-xl font-black transition-colors">{{ formatSize(totalSelectedSize) }}</div>
      </div>
    </div>

    <!-- Actions Bar -->
    <div class="flex gap-2 mb-4">
      <button 
        @click="handleDownloadZip"
        :disabled="selectedUrls.size === 0 || isLimitExceeded"
        class="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition-all shadow-lg shadow-blue-500/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>导出已选 ({{ selectedUrls.size }})</span>
      </button>

      <button 
        @click="handleClear"
        class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-red-100 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        title="清空所有记录"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
    </div>

    <!-- List Controls -->
    <div class="flex items-center justify-between px-1 mb-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input 
          type="checkbox" 
          @change="toggleSelectAll" 
          :checked="selectedUrls.size > 0 && selectedUrls.size === batchStore.processedResults.filter(r => r.status === 'success').length"
          class="w-4 h-4 rounded border-gray-300 text-blue-600"
        >
        <span class="text-xs font-bold text-gray-500">全选成品</span>
      </label>
      <span class="text-[10px] text-gray-400">限制: {{ MAX_ZIP_SIZE_MB }}MB</span>
    </div>

    <!-- Manager List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
      <div v-if="batchStore.processedResults.length === 0 && !batchStore.currentItem" class="h-40 flex flex-col items-center justify-center text-gray-400 gap-2 opacity-60 italic">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M19 11H5m14 0c1 0 2 1 2 2v6c0 1-1 2-2 2H5c-1 0-2-1-2-2v-6c0-1 1-2 2-2m14 0V9c0-1-1-2-2-2M5 11V9c0-1 1-2 2-2m10 0V5c0-1-1-2-2-2H9c-1 0-2 1-2 2v2m10 0H7"/></svg>
        <span class="text-xs">暂无下载记录</span>
      </div>

      <div class="space-y-2 pb-4">
        <!-- Current Item (if any) -->
        <div v-if="batchStore.currentItem" class="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/40 rounded-xl flex items-center gap-3 animate-pulse">
           <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
           <div class="flex-1 min-w-0">
             <div class="text-xs font-bold text-blue-700 dark:text-blue-400 truncate">{{ batchStore.currentItem.title }}</div>
             <div class="text-[9px] text-blue-500 mt-0.5">正在抓取内容并预处理图片...</div>
           </div>
        </div>

        <!-- History Results -->
        <div 
          v-for="item in [...batchStore.processedResults].reverse()" 
          :key="item.url"
          class="p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl flex items-center gap-3 hover:border-blue-100 dark:hover:border-blue-900 group"
        >
          <input 
            v-if="item.status === 'success'"
            type="checkbox" 
            :checked="selectedUrls.has(item.url)"
            @change="selectedUrls.has(item.url) ? selectedUrls.delete(item.url) : selectedUrls.add(item.url)"
            class="w-4 h-4 rounded border-gray-300 text-blue-600"
          >
          <div v-else class="w-4 h-4 flex items-center justify-center shrink-0">
            <span v-if="item.status === 'failed'" class="text-red-500">❌</span>
            <span v-else class="text-gray-300">⏳</span>
          </div>

          <div class="flex-1 min-w-0">
             <div class="flex items-center gap-1.5 mb-0.5">
                <span :class="[item.status === 'success' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400']" class="text-xs font-bold truncate flex-1 uppercase tracking-tight">{{ item.title }}</span>
                <span v-if="item.size" class="text-xs font-mono text-gray-400">{{ formatSize(item.size) }}</span>
             </div>
             <div class="text-[11px] text-gray-400 truncate opacity-60">{{ item.url }}</div>
          </div>

          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button v-if="item.status === 'success'" @click="handleSingleDownload(item)" class="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-gray-400 hover:text-blue-600" title="常规下载">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button @click="openUrl(item.url)" class="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500" title="打开链接">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
            <button @click="deleteItem(item.url)" class="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500" title="删除记录">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
            </button>
          </div>
        </div>

        <!-- Pending Items from Queue -->
        <div v-for="item in batchStore.queueLength" :key="item" class="p-3 bg-gray-50/50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-3 opacity-50">
           <div class="w-4 h-4 border-2 border-gray-300 rounded-full shrink-0"></div>
           <div class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">排队等待中...</div>
        </div>
      </div>
    </div>
  </div>
</template>
