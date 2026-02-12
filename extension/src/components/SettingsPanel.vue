<script setup lang="ts">
import { useSettingsStore } from '../store/settings'
import { computed } from 'vue'

const settings = useSettingsStore()

const scrollSpeedDisplay = computed(() => (settings.scrollWaitTime / 1000).toFixed(1) + 's')

const imageModes = [
  { value: 'original', label: '保持原链接', desc: '直接使用文档原始图片 URL' },
  { value: 'base64', label: '转为 Base64 (内嵌)', desc: '图片转为 Base64 字符串内连' },
  { value: 'local', label: '下载到本地 (ZIP)', desc: '导出时将图片打包下载' },
  { value: 'minio', label: '上传到图床 (OSS)', desc: '自动上传图片到指定的 OSS' },
]

const providers = [
  { value: 'aliyun', label: '阿里云 OSS' },
  { value: 's3', label: 'S3 / MinIO' },
]

const concurrencyOptions = [
  { value: 1, label: '1', desc: '最稳' },
  { value: 2, label: '2', desc: '均衡' },
  { value: 3, label: '3', desc: '更快' },
]
</script>

<template>
  <div class="flex flex-col gap-6 p-1">
    <!-- Image Processing Mode -->
    <section class="space-y-3">
      <div class="flex flex-col">
        <h3 class="text-[15px] font-semibold flex items-center gap-2">
          <span class="text-blue-500">🖼️</span> 图片处理模式
        </h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">选择导出时如何处理文档中的图片。</p>
      </div>
      
      <div class="grid grid-cols-1 gap-2">
        <div 
          v-for="mode in imageModes" 
          :key="mode.value"
          @click="settings.imageMode = mode.value"
          :class="[
            'p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col',
            settings.imageMode === mode.value 
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10' 
              : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-900'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-sm">{{ mode.label }}</span>
            <div v-if="settings.imageMode === mode.value" class="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
            <div v-else class="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-600"></div>
          </div>
          <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{{ mode.desc }}</p>
        </div>
      </div>
    </section>

    <!-- OSS Config (Conditional) -->
    <transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <section v-if="settings.imageMode === 'minio'" class="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-2xl space-y-4 border border-gray-200 dark:border-gray-700">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider">OSS 配置细节</h4>
        
        <div class="space-y-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-medium text-gray-500 ml-1">服务商</label>
            <select v-model="settings.ossConfig.provider" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option v-for="p in providers" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-[11px] font-medium text-gray-500 ml-1">Endpoint</label>
            <input v-model="settings.ossConfig.endpoint" type="text" placeholder="oss-cn-hangzhou.aliyuncs.com" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium text-gray-500 ml-1">AccessKey ID</label>
              <input v-model="settings.ossConfig.accessKeyId" type="text" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium text-gray-500 ml-1">AccessKey Secret</label>
              <input v-model="settings.ossConfig.accessKeySecret" type="password" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium text-gray-500 ml-1">Bucket Name</label>
              <input v-model="settings.ossConfig.bucket" type="text" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] font-medium text-gray-500 ml-1">Region</label>
              <input v-model="settings.ossConfig.region" type="text" placeholder="cn-hangzhou" class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>
      </section>
    </transition>

    <!-- Other Switches -->
    <section class="space-y-4">
      <div class="flex items-center justify-between p-1">
        <div class="flex flex-col">
          <span class="text-sm font-medium">前台运行批处理</span>
          <span class="text-[11px] text-gray-400">在当前激活标签页运行，提高抓取成功率</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" v-model="settings.foreground" class="sr-only peer">
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div class="flex items-center justify-between p-1">
        <div class="flex flex-col">
          <span class="text-sm font-medium">合并批量抓取结果</span>
          <span class="text-[11px] text-gray-400">将选中的内容合并为一个文件（适用于简历等）</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" v-model="settings.mergeBatch" class="sr-only peer">
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div class="space-y-3 p-1">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">滚动抓取等待时间</span>
          <span class="text-xs font-mono font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-md">{{ scrollSpeedDisplay }}</span>
        </div>
        <input 
          type="range" 
          min="500" 
          max="3000" 
          step="100" 
          v-model.number="settings.scrollWaitTime"
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
        >
        <div class="flex justify-between text-[10px] text-gray-400 px-1">
          <span>快 (0.5s)</span>
          <span>均衡 (1.5s)</span>
          <span>稳健 (3.0s)</span>
        </div>
      </div>

      <div class="space-y-3 p-1">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">批量并发数</span>
          <span class="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 px-2 py-0.5 rounded-md">
            {{ settings.batchConcurrency }} 路
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="item in concurrencyOptions"
            :key="item.value"
            @click="settings.batchConcurrency = item.value"
            :class="[
              'h-10 rounded-lg border text-xs font-bold transition-all',
              settings.batchConcurrency === item.value
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 hover:border-emerald-300'
            ]"
          >
            {{ item.label }} 路 · {{ item.desc }}
          </button>
        </div>
        <p class="text-[10px] text-gray-400 px-1">系统会根据失败率和缓存体积动态降速，优先保证稳定性。</p>
      </div>
    </section>
  </div>
</template>
