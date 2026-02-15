import { runtimeTaskCenter } from './taskCenter'
import { isRuntimeAction, type RuntimeRequest, type RuntimeResponse } from '../shared/contracts/runtime'

export async function handleRuntimeMessage(request: unknown): Promise<RuntimeResponse | undefined> {
    if (!request || typeof request !== 'object') return undefined

    const action = (request as { action?: unknown }).action
    if (!isRuntimeAction(action)) return undefined

    const handler = runtimeTaskCenter[action] as (payload: RuntimeRequest) => Promise<RuntimeResponse>
    if (!handler) return undefined

    return await handler(request as RuntimeRequest)
}
