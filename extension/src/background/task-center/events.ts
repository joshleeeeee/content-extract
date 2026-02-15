import { syncRuntimeState } from '../runtime'
import { runtimeState } from '../state'
import { saveState } from '../storage'
import type { ExtractionProgressEvent } from '../../shared/contracts/runtime'

export async function updateExtractionProgress(request: ExtractionProgressEvent): Promise<{ success: boolean }> {
    const requestId = String(request.requestId || '')
    const taskUrl = runtimeState.extractionRequestToUrl.get(requestId)
    if (taskUrl) {
        const running = runtimeState.activeTasks.get(taskUrl)
        if (running) {
            const total = Number(request.total)
            const round = Number(request.round)
            const added = Number(request.added)
            const maxRounds = Number(request.maxRounds)
            const message = typeof request.message === 'string' ? request.message : ''

            if (Number.isFinite(total) && total >= 0) running.item.progressTotal = total
            if (Number.isFinite(round) && round >= 0) running.item.progressRound = round
            if (Number.isFinite(added) && added >= 0) running.item.progressAdded = added
            if (Number.isFinite(maxRounds) && maxRounds > 0) running.item.progressMaxRounds = maxRounds
            if (message) running.item.progressMessage = message

            syncRuntimeState()

            const now = Date.now()
            if (request.done || now - runtimeState.lastProgressPersistAt > 1500) {
                runtimeState.lastProgressPersistAt = now
                await saveState()
            }
        }
    }

    return { success: true }
}
