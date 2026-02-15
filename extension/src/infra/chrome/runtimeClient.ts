import type { RuntimeRequest, RuntimeResponse } from '../../shared/contracts/runtime'

export function sendRuntimeMessage<TResponse = RuntimeResponse>(request: RuntimeRequest | Record<string, unknown>) {
    return new Promise<TResponse>((resolve, reject) => {
        chrome.runtime.sendMessage(request, (response: TResponse) => {
            const err = chrome.runtime.lastError
            if (err) {
                reject(new Error(err.message))
                return
            }
            resolve(response)
        })
    })
}
