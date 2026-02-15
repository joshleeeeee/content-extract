import type { RuntimeAction, RuntimeRequest, RuntimeResponse } from '../../shared/contracts/runtime'

export type RuntimeTaskCenterHandler<TRequest extends RuntimeRequest = RuntimeRequest> = (request: TRequest) => Promise<RuntimeResponse>

export type RuntimeTaskCenterMap = {
    [K in RuntimeAction]: RuntimeTaskCenterHandler<Extract<RuntimeRequest, { action: K }>>
}
