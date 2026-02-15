import type { ContentRequest } from '../../shared/contracts/content'

export async function queryActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs[0] || null
}

export function sendTabMessage<TResponse = unknown>(tabId: number, request: ContentRequest | Record<string, unknown>) {
    return new Promise<TResponse>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, request, (response: TResponse) => {
            const err = chrome.runtime.lastError
            if (err) {
                reject(new Error(err.message))
                return
            }
            resolve(response)
        })
    })
}
