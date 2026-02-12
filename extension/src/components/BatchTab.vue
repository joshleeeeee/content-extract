<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBatchStore, type BatchItem } from '../store/batch'
import { useSettingsStore } from '../store/settings'

const batchStore = useBatchStore()
const settingsStore = useSettingsStore()

const isScanning = ref(false)
const isScrollScanning = ref(false)
const selectedIndexes = ref<Set<number>>(new Set())
const batchFormat = ref<'markdown' | 'pdf'>('markdown')
const showTips = ref({
  sidebar: localStorage.getItem('dismissed-tip-sidebar') !== 'true',
})

const dismissTip = (type: 'sidebar') => {
  showTips.value[type] = false
  localStorage.setItem(`dismissed-tip-${type}`, 'true')
}

// Helper to add links incrementally and auto-select new non-downloaded ones
const addLinksIncrementally = (newLinks: { title: string; url: string }[]) => {
  const existingUrls = new Set(batchStore.scannedLinks.map(l => l.url))
  const downloadedUrls = new Set(batchStore.processedResults.map(r => r.url))

  newLinks.forEach((link: BatchItem) => {
    if (!existingUrls.has(link.url)) {
      batchStore.scannedLinks.push(link)
      existingUrls.add(link.url)
    }
  })

  // Auto-select non-downloaded links
  batchStore.scannedLinks.forEach((link, idx) => {
    if (!downloadedUrls.has(link.url)) {
      selectedIndexes.value.add(idx)
    }
  })
}

const scanLinks = async () => {
  isScanning.value = true
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_LINKS' })
    if (response && response.success) {
      addLinksIncrementally(response.links || [])
    }
  } catch (e) {
    console.error('Scan error:', e)
  } finally {
    isScanning.value = false
  }
}

const scrollScanLinks = async () => {
  if (isScrollScanning.value) {
    // Stop the current scroll scan
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { action: 'STOP_SCROLL_SCAN' })
      }
    } catch (e) {
      console.error('Stop scroll scan error:', e)
    }
    isScrollScanning.value = false
    return
  }

  isScrollScanning.value = true
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    // Open a long-lived port connection to the content script
    const port = chrome.tabs.connect(tab.id, { name: 'scroll-scan' })

    port.onMessage.addListener((msg: any) => {
      if (msg.type === 'partial') {
        addLinksIncrementally(msg.links || [])
      } else if (msg.type === 'done') {
        isScrollScanning.value = false
      } else if (msg.type === 'error') {
        console.error('Scroll scan error:', msg.error)
        isScrollScanning.value = false
      }
    })

    port.onDisconnect.addListener(() => {
      isScrollScanning.value = false
    })
  } catch (e) {
    console.error('Scroll scan error:', e)
    isScrollScanning.value = false
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

  batchStore.startBatch(items, batchFormat.value, {
    imageMode: settingsStore.imageMode,
    foreground: settingsStore.foreground,
    batchConcurrency: settingsStore.batchConcurrency,
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
    <!-- Scan Buttons -->
    <div class="flex flex-col gap-3 mb-4">
      <div class="flex gap-2">
        <button 
          @click="scanLinks"
          :disabled="isScanning || isScrollScanning || batchStore.isProcessing"
          class="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-500/20"
        >
          <template v-if="isScanning">
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>扫描中...</span>
          </template>
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span>扫描页面</span>
          </template>
        </button>

        <button 
          @click="scrollScanLinks"
          :disabled="isScanning || batchStore.isProcessing"
          :class="[
            'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl font-bold text-sm transition-all shadow-md',
            isScrollScanning
              ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20 disabled:opacity-50'
          ]"
        >
          <template v-if="isScrollScanning">
            <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>停止滚动</span>
          </template>
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3v18m0 0-4-4m4 4 4-4M8 7H4m16 0h-4"/></svg>
            <span>滚动扫描</span>
          </template>
        </button>
      </div>

      <!-- Format Selector -->
      <div class="flex items-center gap-2 px-1">
        <span class="text-xs font-bold text-gray-500">导出格式</span>
        <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            @click="batchFormat = 'markdown'"
            :class="[
              'px-3 py-1 text-xs font-bold rounded-md transition-all',
              batchFormat === 'markdown'
                ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            ]"
          >Markdown</button>
          <button
            @click="batchFormat = 'pdf'"
            :class="[
              'px-3 py-1 text-xs font-bold rounded-md transition-all',
              batchFormat === 'pdf'
                ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            ]"
          >PDF</button>
        </div>
      </div>

      <!-- BIG Start Batch Button -->
      <button 
        @click="handleStartBatch"
        :disabled="selectedIndexes.size === 0 || batchStore.isProcessing"
        class="batch-start-btn group relative w-full flex items-center justify-center gap-3 h-14 rounded-2xl font-black text-base tracking-wide transition-all duration-500 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
      >
        <!-- Animated gradient background -->
        <div class="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-500"></div>
        <div class="absolute inset-0 bg-gradient-to-r from-cyan-500 via-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <!-- Glow effect -->
        <div class="absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] rounded-2xl"></div>
        <div class="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 rounded-2xl blur-lg opacity-30 group-hover:opacity-50 transition-opacity duration-500 -z-10"></div>
        <!-- Content -->
        <div class="relative flex items-center justify-center gap-3 text-white z-10">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
          </svg>
          <span>开始抓取</span>
          <span v-if="selectedIndexes.size > 0" class="bg-white/25 text-white text-xs font-black px-2 py-0.5 rounded-full">{{ selectedIndexes.size }}</span>
        </div>
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

      <!-- Scroll scan status indicator -->
      <div v-if="isScrollScanning" class="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex gap-3 items-center">
        <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
        <p class="text-xs text-indigo-700 dark:text-indigo-400 leading-relaxed font-medium">正在自动滚动页面并扫描文档链接...已发现 <strong>{{ batchStore.scannedLinks.length }}</strong> 个文档</p>
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
        <span class="text-xs">点击「扫描页面」快速扫描，或「滚动扫描」自动边滚动边发现</span>
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

<style scoped>
.batch-start-btn:not(:disabled):active {
  transform: scale(0.98);
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.batch-start-btn:not(:disabled) > div:last-of-type {
  animation: glow-pulse 2s ease-in-out infinite;
}
</style>
