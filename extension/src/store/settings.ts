import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface OssConfig {
    provider: string
    endpoint: string
    accessKeyId: string
    accessKeySecret: string
    bucket: string
    region: string
    domain: string
    folder: string
}

export const useSettingsStore = defineStore('settings', () => {
    // --- States ---
    const imageMode = ref(localStorage.getItem('feishu-copy-image-mode') || 'local')
    const foreground = ref(localStorage.getItem('feishu-copy-foreground') === 'true')
    const mergeBatch = ref(localStorage.getItem('feishu-copy-merge-batch') === 'true')
    const scrollWaitTime = ref(parseInt(localStorage.getItem('feishu-copy-scroll-speed') || '1500'))

    const ossConfig = ref<OssConfig>(JSON.parse(localStorage.getItem('feishu-copy-oss-config') || '{}'))
    if (!ossConfig.value.provider) {
        ossConfig.value = {
            provider: 'aliyun',
            endpoint: '',
            accessKeyId: '',
            accessKeySecret: '',
            bucket: '',
            region: '',
            domain: '',
            folder: ''
        }
    }

    // --- Watchers for Persistence ---
    watch(imageMode, (val) => localStorage.setItem('feishu-copy-image-mode', val))
    watch(foreground, (val) => localStorage.setItem('feishu-copy-foreground', String(val)))
    watch(mergeBatch, (val) => localStorage.setItem('feishu-copy-merge-batch', String(val)))
    watch(scrollWaitTime, (val) => localStorage.setItem('feishu-copy-scroll-speed', String(val)))
    watch(ossConfig, (val) => localStorage.setItem('feishu-copy-oss-config', JSON.stringify(val)), { deep: true })

    // --- Actions ---
    const setMergeBatchContextAware = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab && tab.url) {
            const url = tab.url.toLowerCase()
            if (url.includes('zhipin.com')) {
                mergeBatch.value = true
            } else if (url.includes('feishu.cn') || url.includes('larksuite.com')) {
                mergeBatch.value = false
            }
        }
    }

    return {
        imageMode,
        foreground,
        mergeBatch,
        scrollWaitTime,
        ossConfig,
        setMergeBatchContextAware
    }
})
