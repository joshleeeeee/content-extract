<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBatchStore, type BatchItem } from '../store/batch'
import { useSettingsStore } from '../store/settings'

const batchStore = useBatchStore()
const settingsStore = useSettingsStore()

const isScanning = ref(false)
const selectedIndexes = ref<Set<number>>(new Set())
const showTips = ref({
  sidebar: localStorage.getItem('dismissed-tip-sidebar') !== 'true',
  scroll: localStorage.getItem('dismissed-tip-scroll') !== 'true'
})

const dismissTip = (type: 'sidebar' | 'scroll') => {
  showTips.value[type] = false
  localStorage.setItem(`dismissed-tip-${type}`, 'true')
}

const scanLinks = async () => {
  isScanning.value = true
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_LINKS' })
    if (response && response.success) {
      const newLinks = response.links || []
      const existingUrls = new Set(batchStore.scannedLinks.map(l => l.url))
      const downloadedUrls = new Set(batchStore.processedResults.map(r => r.url))
      
      let addedCount = 0
      newLinks.forEach((link: BatchItem) => {
        if (!existingUrls.has(link.url)) {
          batchStore.scannedLinks.push(link)
          addedCount++
        }
      })
      
      // Auto-select non-downloaded new links
      batchStore.scannedLinks.forEach((link, idx) => {
        if (!downloadedUrls.has(link.url)) {
          selectedIndexes.value.add(idx)
        }
      })
    }
  } catch (e) {
    console.error('Scan error:', e)
  } finally {
    isScanning.value = false
  }
}

const toggleSelectAll = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    batchStore.scannedLinks.forEach((_, idx) => selectedIndexes.value.add(idx))
  } else {
    selectedIndexes.value.clear()
  }
}

const isAllSelected = computed(() => {
  return batchStore.scannedLinks.length > 0 && selectedIndexes.value.size === batchStore.scannedLinks.length
})

const isDownloaded = (url: string) => {
  return batchStore.processedResults.some(r => r.url === url && r.status === 'success')
}

const handleStartBatch = () => {
  const items = Array.from(selectedIndexes.value).map(idx => batchStore.scannedLinks[idx])
  if (items.length === 0) return

  batchStore.startBatch(items, 'markdown', {
    imageMode: settingsStore.imageMode,
    foreground: settingsStore.foreground,
    scrollWaitTime: settingsStore.scrollWaitTime,
    imageConfig: {
      enabled: settingsStore.imageMode === 'minio',
      ...settingsStore.ossConfig
    }
  })
}

let pollTimer: number | null = null
onMounted(() => {
  batchStore.updateStatus()
  pollTimer = window.setInterval(() => batchStore.updateStatus(), 2000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Batch Actions -->
    <div class="flex gap-3 mb-4">
      <button 
        @click="scanLinks"
        :disabled="isScanning || batchStore.isProcessing"
        class="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/20"
      >
        <template v-if="isScanning">
          <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span>正在扫描...</span>
        </template>
        <template v-else>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span>扫描页面</span>
        </template>
      </button>

      <button 
        @click="handleStartBatch"
        :disabled="selectedIndexes.size === 0 || batchStore.isProcessing"
        class="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-white dark:bg-gray-800 border-2 border-blue-600 text-blue-600 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
        <span>开始抓取 ({{ selectedIndexes.size }})</span>
      </button>
    </div>

    <!-- Tips -->
    <div class="space-y-2 mb-4">
      <div v-if="showTips.sidebar" class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl flex gap-3 relative group">
        <span class="text-amber-500 mt-0.5 text-base">⚠️</span>
        <p class="text-xs text-amber-700 dark:text-amber-400 leading-relaxed pr-4">注意：暂不支持抓取左侧栏链接，建议进入文档列表后再扫描。</p>
        <button @click="dismissTip('sidebar')" class="absolute top-2 right-2 text-amber-300 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div v-if="showTips.scroll" class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl flex gap-3 relative group">
        <span class="text-blue-500 mt-0.5 text-base">ℹ️</span>
        <p class="text-xs text-blue-700 dark:text-blue-400 leading-relaxed pr-4">提示：如链接扫描不全，请向下滑动加载更多后再扫描。</p>
        <button @click="dismissTip('scroll')" class="absolute top-2 right-2 text-blue-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>

    <!-- List Controls -->
    <div class="flex items-center justify-between px-1 mb-2">
      <label class="flex items-center gap-2 cursor-pointer group">
        <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
        <span class="text-xs font-bold text-gray-500 group-hover:text-gray-700">全选</span>
      </label>
      <span class="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-500 font-bold">
        找到 {{ batchStore.scannedLinks.length }} 个文档
      </span>
    </div>

    <!-- Scrollable List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
      <div v-if="batchStore.scannedLinks.length === 0" class="h-40 flex flex-col items-center justify-center text-gray-400 gap-2 opacity-60 italic">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <span class="text-xs">点击扫描以发现文档</span>
      </div>

      <div class="space-y-2">
        <div 
          v-for="(item, idx) in batchStore.scannedLinks" 
          :key="item.url"
          class="p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl flex items-start gap-3 hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group"
          @click="selectedIndexes.has(idx) ? selectedIndexes.delete(idx) : selectedIndexes.add(idx)"
        >
          <input 
            type="checkbox" 
            :checked="selectedIndexes.has(idx)" 
            @click.stop 
            @change="selectedIndexes.has(idx) ? selectedIndexes.delete(idx) : selectedIndexes.add(idx)"
            class="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          >
          <div class="flex-1 min-width-0">
             <h4 :class="[isDownloaded(item.url) ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200']" class="text-sm font-medium leading-tight line-clamp-2 break-all">{{ item.title }}</h4>
             <div class="flex items-center gap-2 mt-1.5 hide-scrollbar overflow-x-auto whitespace-nowrap">
                <span v-if="isDownloaded(item.url)" class="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded uppercase border border-green-100 dark:border-green-800">已下载</span>
                <span class="text-[11px] text-gray-400 font-mono truncate max-w-[200px]">{{ item.url }}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
