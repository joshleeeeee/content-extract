<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useBatchStore, type BatchItem } from '../store/batch'
import { sendRuntimeMessage } from '../infra/chrome/runtimeClient'
import { RUNTIME_ACTIONS } from '../shared/contracts/runtime'
import { formatSize, useBatchExport } from '../application/usecases/export/useBatchExport'

const batchStore = useBatchStore()
const selectedUrls = ref<Set<string>>(new Set())

const {
  volumeSizeMb,
  isDownloading,
  downloadProgress,
  totalSelectedSize,
  volumeCount,
  fetchSingleResult,
  handleDownloadZip,
  handleSingleDownload
} = useBatchExport({ batchStore, selectedUrls })

const latestPreviewLines = ref<string[]>([])
const latestPreviewMeta = ref('')
const latestPreviewLoading = ref(false)
const showOverview = ref(localStorage.getItem('ode-manager-overview') === 'true')
const compactMode = ref(localStorage.getItem('ode-manager-compact') === 'true')
const filterStatus = ref<'all' | 'success' | 'failed'>('all')
const filterFormat = ref<'all' | 'pdf' | 'csv' | 'json' | 'markdown'>('all')
const filterDate = ref<'all' | 'today' | 'week'>('all')
const filterPlatform = ref<string>('all')

watch(showOverview, (value) => {
  localStorage.setItem('ode-manager-overview', String(value))
})

watch(compactMode, (value) => {
  localStorage.setItem('ode-manager-compact', String(value))
})

const getPlatformFromUrl = (url: string): string => {
  if (url.includes('feishu.cn') || url.includes('larksuite.com')) return 'feishu'
  if (url.includes('zhipin.com')) return 'boss'
  if (url.includes('jd.com') || url.includes('jd.hk')) return 'jd'
  if (url.includes('taobao.com') || url.includes('tmall.com')) return 'taobao'
  if (url.includes('douyin.com')) return 'douyin'
  if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) return 'xiaohongshu'
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'bilibili'
  return 'other'
}

const isWithinDateRange = (timestamp: number | undefined, range: 'all' | 'today' | 'week'): boolean => {
  if (range === 'all' || !timestamp) return true
  const now = Date.now()
  const diff = now - timestamp
  if (range === 'today') return diff < 24 * 60 * 60 * 1000
  if (range === 'week') return diff < 7 * 24 * 60 * 60 * 1000
  return true
}

const latestSuccessItem = computed<BatchItem | null>(() => {
  const sorted = [...batchStore.processedResults]
    .filter(item => item.status === 'success')
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
  return sorted[0] || null
})

const filteredResults = computed(() => {
  let results = batchStore.processedResults
  if (filterStatus.value !== 'all') {
    results = results.filter(item => item.status === filterStatus.value)
  }
  if (filterFormat.value !== 'all') {
    results = results.filter(item => item.format === filterFormat.value)
  }
  if (filterDate.value !== 'all') {
    results = results.filter(item => isWithinDateRange(item.timestamp, filterDate.value))
  }
  if (filterPlatform.value !== 'all') {
    results = results.filter(item => getPlatformFromUrl(item.url) === filterPlatform.value)
  }
  return results
})

const availablePlatforms = computed(() => {
  const platforms = new Set<string>()
  batchStore.processedResults.forEach(item => {
    platforms.add(getPlatformFromUrl(item.url))
  })
  return Array.from(platforms).sort()
})

const platformNames: Record<string, string> = {
  feishu: '飞书',
  boss: 'BOSS',
  jd: '京东',
  taobao: '淘宝',
  douyin: '抖音',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  other: '其他'
}

const formatDate = (timestamp: number | undefined): string => {
  if (!timestamp) return ''
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const statusCounts = computed(() => ({
  all: batchStore.processedResults.length,
  success: batchStore.processedResults.filter(r => r.status === 'success').length,
  failed: batchStore.processedResults.filter(r => r.status === 'failed').length
}))

const toggleSelectAll = (e: Event) => {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    filteredResults.value.forEach(r => {
      if (r.status === 'success') selectedUrls.value.add(r.url)
    })
  } else {
    selectedUrls.value.clear()
  }
}

const isAllFilteredSuccessSelected = computed(() => {
  const visibleSuccessUrls = filteredResults.value
    .filter(item => item.status === 'success')
    .map(item => item.url)

  return visibleSuccessUrls.length > 0 && visibleSuccessUrls.every(url => selectedUrls.value.has(url))
})

const handleClear = () => {
  if (confirm('确定要清空所有已下载的历史记录吗？正在进行的任务也会停止。')) {
    batchStore.clearResults()
    selectedUrls.value.clear()
  }
}

const deleteItem = (url: string) => {
  void sendRuntimeMessage({ action: RUNTIME_ACTIONS.DELETE_BATCH_ITEM, url })
    .then(() => {
      batchStore.updateStatus()
      selectedUrls.value.delete(url)
    })
    .catch(() => {
      // ignore runtime wake-up failures
    })
}

const retryItem = (url: string) => {
  batchStore.retryItem(url)
}

const retryAllFailed = () => {
  batchStore.retryAllFailed()
}

const isRetryingItem = (url: string) => batchStore.retryingUrls.has(url)

const failedCount = computed(() => batchStore.processedResults.filter(r => r.status === 'failed').length)
const isListLoading = computed(() =>
  !batchStore.hasLoadedStatus || (batchStore.isUpdatingStatus && batchStore.processedResults.length === 0 && !batchStore.currentItem)
)

const currentItemProgressText = computed(() => {
  const current = batchStore.currentItem
  if (!current) return ''
  if (current.taskType !== 'review') return '正在抓取内容并预处理图片...'

  const total = Number(current.progressTotal || 0)
  const round = Number(current.progressRound || 0)
  const added = Number(current.progressAdded || 0)

  if (total > 0) {
    const roundText = round > 0 ? `第 ${round} 轮 · ` : ''
    const addedText = round > 0 ? ` · 本轮 +${added}` : ''
    return `正在提取评论区... ${roundText}累计 ${total} 条${addedText}`
  }

  return current.progressMessage || '正在提取评论区...'
})

const currentItemEtaText = computed(() => {
  const current = batchStore.currentItem
  if (!current || current.taskType !== 'review') return ''

  const round = Number(current.progressRound || 0)
  const maxRounds = Number(current.progressMaxRounds || 0)
  const startedAt = Number(current.progressStartedAt || 0)
  if (round <= 0 || maxRounds <= 0 || startedAt <= 0 || round >= maxRounds) return ''

  const elapsedMs = Date.now() - startedAt
  if (elapsedMs <= 1000) return ''
  const avgMsPerRound = elapsedMs / round
  const etaMs = Math.max(0, avgMsPerRound * (maxRounds - round))

  if (etaMs < 60_000) {
    return `预计约 ${Math.round(etaMs / 1000)} 秒`
  }
  return `预计约 ${Math.ceil(etaMs / 60_000)} 分钟`
})

const parseCsvLine = (line: string) => {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells
}

const extractPreviewFromData = (data: any) => {
  latestPreviewLines.value = []
  latestPreviewMeta.value = ''

  if (!data?.content) return

  if (data.format === 'json') {
    try {
      const parsed = JSON.parse(data.content)
      const reviews = Array.isArray(parsed?.reviews) ? parsed.reviews : []
      latestPreviewMeta.value = `质检预览：共 ${parsed?.reviewCount || reviews.length} 条`
      latestPreviewLines.value = reviews.slice(0, 3).map((item: any, idx: number) => {
        const user = String(item?.user || '匿名用户').trim()
        const content = String(item?.content || '').replace(/\s+/g, ' ').trim()
        return `${idx + 1}. ${user}：${content.slice(0, 70) || '（空）'}`
      })
    } catch (_) {
      latestPreviewMeta.value = ''
      latestPreviewLines.value = []
    }
    return
  }

  if (data.format === 'csv') {
    const raw = String(data.content || '').replace(/^\uFEFF/, '')
    const rows = raw.split(/\r?\n/).filter(Boolean)
    if (rows.length <= 1) return

    const header = parseCsvLine(rows[0])
    const userIndex = header.indexOf('user')
    const contentIndex = header.indexOf('content')
    const timeIndex = header.indexOf('time')

    latestPreviewMeta.value = `质检预览：共 ${rows.length - 1} 条`
    latestPreviewLines.value = rows.slice(1, 4).map((row, idx) => {
      const cols = parseCsvLine(row)
      const user = cols[userIndex] || '匿名用户'
      const time = cols[timeIndex] || ''
      const content = (cols[contentIndex] || '').replace(/\s+/g, ' ').trim()
      return `${idx + 1}. ${user}${time ? ` · ${time}` : ''}：${content.slice(0, 64) || '（空）'}`
    })
  }
}

watch(() => latestSuccessItem.value?.url, async (url) => {
  latestPreviewLines.value = []
  latestPreviewMeta.value = ''
  if (!url) return

  latestPreviewLoading.value = true
  try {
    const data = await fetchSingleResult(url)
    if (data?.taskType === 'review' && (data?.format === 'csv' || data?.format === 'json')) {
      extractPreviewFromData(data)
    }
  } finally {
    latestPreviewLoading.value = false
  }
}, { immediate: true })

const quickDownloadLatest = () => {
  if (!latestSuccessItem.value) return
  void handleSingleDownload(latestSuccessItem.value)
}

const getFailureTip = (item: BatchItem) => {
  const error = String(item.error || '').toLowerCase()
  if (!error) return ''

  if (error.includes('could not establish connection')) {
    return '页面连接中断，刷新商品页后点击重试。'
  }

  if (error.includes('timeout') || error.includes('超时')) {
    return '抓取超时，建议先用“快速抓取”模板再重试。'
  }

  if (error.includes('评论区') || error.includes('容器')) {
    return '请先手动展开评论区（或全部评价），再点击重试。'
  }

  if (item.taskType === 'review') {
    return '建议保持详情页前台可见，等待滚动完成后再重试。'
  }

  return '建议点击重试；若持续失败请刷新目标页面。'
}

const openUrl = (url: string) => window.open(url, '_blank')

const getTaskTypeTag = (item: BatchItem) => {
    return item.taskType === 'review'
        ? { label: '评', className: 'text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded uppercase border border-amber-100 dark:border-amber-800 shrink-0' }
        : { label: '文', className: 'text-[9px] font-black text-slate-500 bg-slate-50 dark:bg-slate-700/60 px-1.5 py-0.5 rounded uppercase border border-slate-200 dark:border-slate-700 shrink-0' }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="mb-3 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex gap-1.5">
          <button
            v-for="status in [{ key: 'all', label: '全部' }, { key: 'success', label: '成功' }, { key: 'failed', label: '失败' }]"
            :key="status.key"
            @click="filterStatus = status.key as any"
            :class="[
              'h-7 px-2.5 rounded-lg text-[10px] font-bold transition-all',
              filterStatus === status.key
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-blue-600 border border-gray-200 dark:border-gray-700'
            ]"
          >{{ status.label }} <span v-if="status.key !== 'all'">({{ statusCounts[status.key as keyof typeof statusCounts] }})</span></button>
        </div>
        <div class="flex gap-1.5">
          <button
            @click="compactMode = !compactMode"
            class="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >{{ compactMode ? '标准' : '紧凑' }}</button>
          <button
            @click="showOverview = !showOverview"
            class="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >{{ showOverview ? '收起' : '概览' }}</button>
        </div>
      </div>

      <div class="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
        <button
          v-for="date in [{ key: 'all', label: '全部' }, { key: 'today', label: '今天' }, { key: 'week', label: '本周' }]"
          :key="date.key"
          @click="filterDate = date.key as any"
          :class="[
            'h-6 px-2 rounded text-[9px] font-bold transition-all shrink-0',
            filterDate === date.key
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-emerald-600 border border-gray-200 dark:border-gray-700'
          ]"
        >{{ date.label }}</button>

        <div class="w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>

        <button
          @click="filterPlatform = 'all'"
          :class="[
            'h-6 px-2 rounded text-[9px] font-bold transition-all shrink-0',
            filterPlatform === 'all'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-purple-600 border border-gray-200 dark:border-gray-700'
          ]"
        >全部平台</button>
        <button
          v-for="platform in availablePlatforms"
          :key="platform"
          @click="filterPlatform = platform"
          :class="[
            'h-6 px-2 rounded text-[9px] font-bold transition-all shrink-0',
            filterPlatform === platform
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-purple-600 border border-gray-200 dark:border-gray-700'
          ]"
        >{{ platformNames[platform] || platform }}</button>
      </div>
    </div>

    <!-- Summary Header -->
    <div v-if="showOverview" class="grid grid-cols-2 gap-3 mb-4">
      <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-bold text-gray-400 mb-1">完成总量</div>
        <div class="text-xl font-black text-blue-600">{{ batchStore.processedResults.filter(r => r.status === 'success').length }}</div>
      </div>
      <div class="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div class="text-xs uppercase tracking-wider font-bold text-gray-400 mb-1">已选大小</div>
        <div class="text-xl font-black text-gray-700 dark:text-gray-200">{{ formatSize(totalSelectedSize) }}</div>
      </div>
    </div>

    <div v-if="showOverview && latestSuccessItem" class="mb-4 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-900/10 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] font-black tracking-wider uppercase text-emerald-600">最近完成</div>
          <div class="text-sm font-bold text-emerald-900 dark:text-emerald-200 truncate">{{ latestSuccessItem.title }}</div>
        </div>
        <button
          @click="quickDownloadLatest"
          class="h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow shrink-0"
        >立即下载</button>
      </div>

      <div v-if="latestPreviewLoading" class="text-[11px] text-emerald-700/80">正在生成质量预览...</div>
      <div v-else-if="latestPreviewLines.length > 0" class="space-y-1">
        <div class="text-[11px] font-bold text-emerald-700">{{ latestPreviewMeta }}</div>
        <div v-for="line in latestPreviewLines" :key="line" class="text-[11px] text-emerald-800/90 dark:text-emerald-200/90 truncate">{{ line }}</div>
      </div>
    </div>

    <!-- Actions Bar -->
    <div class="flex gap-2 mb-4">
      <button 
        @click="handleDownloadZip"
        :disabled="selectedUrls.size === 0 || isDownloading"
        class="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 transition-all shadow-lg shadow-blue-500/10"
      >
        <template v-if="isDownloading">
          <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span>{{ downloadProgress }}</span>
        </template>
        <template v-else>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>导出已选 ({{ selectedUrls.size }})<template v-if="volumeCount > 1"> · {{ volumeCount }} 卷</template></span>
        </template>
      </button>

      <button 
        @click="handleClear"
        class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-red-100 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors shrink-0"
        title="清空所有记录"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>

      <button 
        v-if="failedCount > 0"
        @click="retryAllFailed"
        :disabled="batchStore.isRetryingAll"
        class="flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl border-2 border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors shrink-0 disabled:opacity-60"
        title="重试全部失败任务"
      >
        <div v-if="batchStore.isRetryingAll" class="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin"></div>
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        <span>{{ batchStore.isRetryingAll ? '重试中...' : `重试 (${failedCount})` }}</span>
      </button>
    </div>

    <!-- List Controls -->
    <div class="flex items-center justify-between px-1 mb-2">
      <label class="flex items-center gap-2 cursor-pointer">
        <input 
          type="checkbox" 
          @change="toggleSelectAll" 
          :checked="isAllFilteredSuccessSelected"
          class="w-4 h-4 rounded border-gray-300 text-blue-600"
        >
        <span class="text-xs font-bold text-gray-500">全选成品</span>
      </label>
      <span class="text-[10px] text-gray-400 flex items-center gap-1.5">
        <span v-if="batchStore.isUpdatingStatus && batchStore.hasLoadedStatus" class="inline-block w-2 h-2 border border-gray-300 border-t-blue-500 rounded-full animate-spin"></span>
        <span>每卷 ≤ {{ volumeSizeMb }}MB<template v-if="volumeCount > 1"> · 共 {{ volumeCount }} 卷</template></span>
      </span>
    </div>

    <!-- Manager List -->
    <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
      <div v-if="isListLoading" class="h-40 flex flex-col items-center justify-center text-gray-400 gap-2 opacity-80">
        <div class="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
        <span class="text-xs">正在加载下载列表...</span>
      </div>

      <div v-else-if="batchStore.processedResults.length === 0 && !batchStore.currentItem" class="h-40 flex flex-col items-center justify-center text-gray-400 gap-2 opacity-60 italic">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M19 11H5m14 0c1 0 2 1 2 2v6c0 1-1 2-2 2H5c-1 0-2-1-2-2v-6c0-1 1-2 2-2m14 0V9c0-1-1-2-2-2M5 11V9c0-1 1-2 2-2m10 0V5c0-1-1-2-2-2H9c-1 0-2 1-2 2v2m10 0H7"/></svg>
        <span class="text-xs">暂无下载记录</span>
      </div>

      <div v-else-if="filteredResults.length === 0 && !batchStore.currentItem" class="h-40 flex flex-col items-center justify-center text-gray-400 gap-2 opacity-60 italic">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/></svg>
        <span class="text-xs">当前筛选条件下暂无结果</span>
      </div>

      <div v-else class="pb-4" :class="compactMode ? 'space-y-1.5' : 'space-y-2'">
        <!-- Current Item (if any) -->
        <div v-if="batchStore.currentItem" class="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/40 rounded-xl flex items-center gap-3 animate-pulse">
           <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
           <div class="flex-1 min-w-0">
             <div class="text-xs font-bold text-blue-700 dark:text-blue-400 truncate">{{ batchStore.currentItem.title }}</div>
               <div class="text-[9px] text-blue-500 mt-0.5">
                 {{ currentItemProgressText }}
                 <template v-if="batchStore.activeCount > 1">（另有 {{ batchStore.activeCount - 1 }} 个并发任务）</template>
               </div>
               <div v-if="currentItemEtaText" class="text-[9px] text-blue-400 mt-0.5">{{ currentItemEtaText }}</div>
               <div v-if="batchStore.currentItem.strategyHint" class="text-[9px] text-indigo-500 mt-0.5">策略：{{ batchStore.currentItem.strategyHint }}</div>
           </div>
        </div>

        <!-- History Results -->
        <div
          v-for="item in [...filteredResults].reverse()"
          :key="item.url"
          :class="[
            'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl flex items-center gap-3 hover:border-blue-100 dark:hover:border-blue-900 group',
            compactMode ? 'p-2' : 'p-3'
          ]"
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
                 <span :class="[item.status === 'success' ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400', compactMode ? 'text-[11px]' : 'text-xs']" class="font-bold truncate flex-1 uppercase tracking-tight">{{ item.title }}</span>
                 <span v-if="item.timestamp" class="text-[9px] text-gray-400 shrink-0">{{ formatDate(item.timestamp) }}</span>
                 <span :class="getTaskTypeTag(item).className">{{ getTaskTypeTag(item).label }}</span>
                 <span v-if="item.format === 'pdf'" class="text-[9px] font-black text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded uppercase border border-red-100 dark:border-red-800 shrink-0">PDF</span>
                 <span v-else-if="item.format === 'csv'" class="text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded uppercase border border-emerald-100 dark:border-emerald-800 shrink-0">CSV</span>
                 <span v-else-if="item.format === 'json'" class="text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded uppercase border border-amber-100 dark:border-amber-800 shrink-0">JSON</span>
                 <span v-else-if="item.format === 'markdown'" class="text-[9px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded uppercase border border-blue-100 dark:border-blue-800 shrink-0">MD</span>
                 <span v-if="item.size" class="text-xs font-mono text-gray-400 shrink-0">{{ formatSize(item.size) }}</span>
              </div>
             <div v-if="!compactMode" class="text-[11px] text-gray-400 truncate opacity-60">{{ item.url }}</div>
             <div v-if="item.status === 'failed' && item.error" class="text-[10px] text-red-400 mt-0.5 truncate" :title="item.error">❌ {{ item.error }}</div>
             <div v-if="item.status === 'failed' && !compactMode" class="text-[10px] text-amber-500 mt-0.5 truncate">建议：{{ getFailureTip(item) }}</div>
           </div>

          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button v-if="item.status === 'success'" @click="handleSingleDownload(item)" class="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-gray-400 hover:text-blue-600" title="常规下载">
               <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button
              v-if="item.status === 'failed'"
              @click="retryItem(item.url)"
              :disabled="isRetryingItem(item.url)"
              class="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-gray-400 hover:text-amber-600 disabled:opacity-60"
              :title="isRetryingItem(item.url) ? '重试中' : '重试'"
            >
               <div v-if="isRetryingItem(item.url)" class="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-500 rounded-full animate-spin"></div>
               <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
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
