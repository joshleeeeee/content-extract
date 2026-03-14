import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
    DEFAULT_HOST,
    DEFAULT_PORT,
    HEARTBEAT_TTL_MS,
    TERMINAL_JOB_STATES,
    createId,
    createLayout,
    daemonBaseUrl,
    inferDefaultFormat,
    inferTaskTypeFromUrl,
    normalizeBase64Payload,
    resolveHomeDir,
    sanitizeFileComponent
} from './config.mjs'
import {
    copyFile,
    ensureLayout,
    loadJsonMapFromDir,
    readJson,
    removePath,
    writeBinary,
    writeJson,
    writeText
} from './store.mjs'

const JOB_STATE_ACCEPTED = 'accepted'
const JOB_STATE_QUEUED = 'queued'
const JOB_STATE_RUNNING = 'running'
const JOB_STATE_SUCCEEDED = 'succeeded'
const JOB_STATE_FAILED = 'failed'
const JOB_STATE_DELETING = 'deleting'
const JOB_STATE_DELETED = 'deleted'
const JOB_STATE_WAITING_EXTENSION = 'waiting_extension'

const TEXT_FORMAT_EXTENSION_MAP = {
    markdown: '.md',
    html: '.html',
    csv: '.csv',
    json: '.json'
}

function createDefaultState() {
    return {
        version: 2,
        startedAt: Date.now(),
        commands: [],
        clients: {},
        requestIndex: {},
        lastSnapshot: null
    }
}

function isConnectedClient(client) {
    if (!client?.lastSeenAt) return false
    return Date.now() - client.lastSeenAt <= HEARTBEAT_TTL_MS
}

function normalizeUrl(input) {
    const parsed = new URL(String(input || '').trim())
    return parsed.toString()
}

function makeJobFilePath(context, jobId) {
    return path.join(context.layout.jobsDir, `${jobId}.json`)
}

function makeResultDir(context, jobId) {
    return path.join(context.layout.resultsDir, jobId)
}

function serializeJob(job) {
    return {
        ...job,
        updatedAt: Number(job.updatedAt || Date.now())
    }
}

async function persistState(context) {
    await writeJson(context.layout.stateFile, context.state)
}

async function persistJob(context, job) {
    context.jobs.set(job.jobId, job)
    await writeJson(makeJobFilePath(context, job.jobId), serializeJob(job))
}

async function loadContext(config) {
    const layout = createLayout(config.baseDir)
    await ensureLayout(layout)

    const state = normalizeState(await readJson(layout.stateFile, createDefaultState()))
    const jobs = await loadJsonMapFromDir(layout.jobsDir)

    return {
        config,
        layout,
        state,
        jobs,
        shuttingDown: false,
        server: null
    }
}

function normalizeState(state) {
    const normalized = {
        ...createDefaultState(),
        ...(state || {})
    }
    normalized.version = 2
    normalized.commands = Array.isArray(normalized.commands)
        ? normalized.commands.map((command) => ({
            ...command,
            delivery: normalizeCommandDelivery(command?.delivery)
        }))
        : []
    normalized.clients = normalized.clients && typeof normalized.clients === 'object' ? normalized.clients : {}
    normalized.requestIndex = normalized.requestIndex && typeof normalized.requestIndex === 'object' ? normalized.requestIndex : {}
    return normalized
}

function normalizeCommandDelivery(delivery) {
    if (!delivery || typeof delivery !== 'object') return null
    if (!delivery.clientId) return null
    const leasedAt = Number(delivery.leasedAt)
    if (!Number.isFinite(leasedAt) || leasedAt <= 0) return null
    return {
        clientId: delivery.clientId,
        leasedAt
    }
}

function getJobCounts(context) {
    const counts = {
        accepted: 0,
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        deleting: 0,
        deleted: 0
    }

    for (const job of context.jobs.values()) {
        if (counts[job.state] !== undefined) {
            counts[job.state] += 1
        }
    }

    return counts
}

function resultRefFromJob(job, inline = false) {
    if (!job?.result) return null

    const result = { ...job.result }
    if (!inline) {
        delete result.inline
    }
    return result
}

function jobResponse(job, inline = false) {
    return {
        jobId: job.jobId,
        requestId: job.requestId || null,
        origin: job.origin,
        state: job.state,
        source: job.source,
        taskType: job.taskType,
        format: job.format,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error || null,
        result: resultRefFromJob(job, inline)
    }
}

function createJobRecord(rawItem, { origin = 'cli', state = JOB_STATE_ACCEPTED } = {}) {
    const now = Date.now()
    const url = normalizeUrl(rawItem.url)
    const taskType = rawItem.taskType || inferTaskTypeFromUrl(url)
    const format = rawItem.format || inferDefaultFormat(taskType)
    const title = String(rawItem.title || url).trim() || url

    return {
        jobId: rawItem.jobId || createId('job'),
        requestId: rawItem.requestId || rawItem.request_id || null,
        origin,
        state,
        source: {
            url,
            title
        },
        taskType,
        format,
        options: rawItem.options || {},
        createdAt: now,
        updatedAt: now,
        error: null,
        result: null
    }
}

function queueCommand(context, action, payload) {
    const command = {
        commandId: createId('cmd'),
        action,
        payload,
        createdAt: Date.now(),
        delivery: null
    }
    context.state.commands.push(command)
    return command
}

function hasActiveCommandLease(command) {
    const leasedAt = Number(command?.delivery?.leasedAt)
    if (!Number.isFinite(leasedAt) || leasedAt <= 0) return false
    return Date.now() - leasedAt <= HEARTBEAT_TTL_MS
}

async function claimBridgeCommands(context, clientId) {
    const commands = []
    let changed = false

    for (const command of context.state.commands) {
        if (hasActiveCommandLease(command)) {
            continue
        }

        command.delivery = {
            clientId,
            leasedAt: Date.now()
        }
        commands.push(command)
        changed = true
    }

    if (changed) {
        await persistState(context)
    }

    return commands
}

async function queueGlobalCommand(context, action, payload = { action }) {
    queueCommand(context, action, payload)
    await persistState(context)
}

async function submitJobs(context, body) {
    const items = Array.isArray(body?.items) ? body.items : []
    if (!items.length) {
        return { success: false, error: 'items is required' }
    }

    const acceptedJobs = []
    const bridgeItems = []
    const execution = body?.execution || {}

    if (typeof execution.windowMode === 'boolean') {
        queueCommand(context, 'SET_BATCH_WINDOW_MODE', {
            action: 'SET_BATCH_WINDOW_MODE',
            value: execution.windowMode
        })
    }
    if (Number.isFinite(Number(execution.windowCount))) {
        queueCommand(context, 'SET_BATCH_WINDOW_COUNT', {
            action: 'SET_BATCH_WINDOW_COUNT',
            value: Number(execution.windowCount)
        })
    }

    for (const rawItem of items) {
        const requestId = rawItem.requestId || rawItem.request_id || null
        const existingJobId = requestId ? context.state.requestIndex[requestId] : null
        if (existingJobId && context.jobs.has(existingJobId)) {
            acceptedJobs.push(context.jobs.get(existingJobId))
            continue
        }

        const job = createJobRecord(rawItem, { origin: 'cli', state: JOB_STATE_ACCEPTED })
        context.jobs.set(job.jobId, job)
        if (requestId) {
            context.state.requestIndex[requestId] = job.jobId
        }
        await persistJob(context, job)
        acceptedJobs.push(job)
        bridgeItems.push({
            jobId: job.jobId,
            url: job.source.url,
            title: job.source.title,
            taskType: job.taskType,
            format: job.format,
            options: job.options
        })
    }

    if (bridgeItems.length) {
        queueCommand(context, 'START_BATCH_PROCESS', {
            action: 'START_BATCH_PROCESS',
            items: bridgeItems,
            format: bridgeItems[0].format,
            options: bridgeItems[0].options
        })
    }

    await persistState(context)

    return {
        success: true,
        jobs: acceptedJobs.map((job) => jobResponse(job))
    }
}

function mergeDiscoveredJob(context, item, state) {
    const jobId = item.jobId || item.url
    const existing = context.jobs.get(jobId)
    const next = existing || createJobRecord({
        jobId,
        url: item.url,
        title: item.title,
        taskType: item.taskType,
        format: item.format,
        options: item.options || {}
    }, {
        origin: 'extension',
        state
    })

    next.jobId = jobId
    next.origin = next.origin || 'extension'
    next.source = {
        url: item.url,
        title: item.title
    }
    next.taskType = item.taskType
    next.format = item.format
    next.state = state
    next.updatedAt = Date.now()
    if (item.status === 'failed' && item.error) {
        next.error = item.error
    }

    context.jobs.set(jobId, next)
    return next
}

function applyCommandAck(context, ack) {
    const index = context.state.commands.findIndex((command) => command.commandId === ack.commandId)
    if (index < 0) return

    const command = context.state.commands[index]
    context.state.commands.splice(index, 1)

    const payload = command.payload || {}
    const targetJobIds = payload.jobId
        ? [payload.jobId]
        : (Array.isArray(payload.items) ? payload.items.map((item) => item?.jobId).filter(Boolean) : [])

    if (!ack.success) {
        for (const jobId of targetJobIds) {
            if (!context.jobs.has(jobId)) continue
            const job = context.jobs.get(jobId)
            job.error = ack.error || 'Bridge command failed'
            job.updatedAt = Date.now()
        }
        return
    }

    if (command.action === 'START_BATCH_PROCESS') {
        for (const jobId of targetJobIds) {
            if (!context.jobs.has(jobId)) continue
            const job = context.jobs.get(jobId)
            if (!TERMINAL_JOB_STATES.has(job.state)) {
                job.state = JOB_STATE_ACCEPTED
            }
            job.updatedAt = Date.now()
            job.error = null
        }
    }

    if (command.action === 'DELETE_BATCH_ITEM') {
        for (const jobId of targetJobIds) {
            if (!context.jobs.has(jobId)) continue
            const job = context.jobs.get(jobId)
            job.state = JOB_STATE_DELETED
            job.updatedAt = Date.now()
            job.error = null
        }
    }

    if (command.action === 'RETRY_BATCH_ITEM') {
        for (const jobId of targetJobIds) {
            if (!context.jobs.has(jobId)) continue
            const job = context.jobs.get(jobId)
            job.state = JOB_STATE_ACCEPTED
            job.updatedAt = Date.now()
            job.error = null
        }
    }

    if (command.action === 'CLEAR_BATCH_RESULTS') {
        for (const job of context.jobs.values()) {
            if (job.state !== JOB_STATE_DELETED) {
                job.state = JOB_STATE_DELETED
                job.result = null
                job.error = null
                job.updatedAt = Date.now()
            }
        }
    }
}

async function syncJobsFromBridgeStatus(context, status, clientMeta) {
    const queuedItems = Array.isArray(status?.queueItems) ? status.queueItems : []
    const activeItems = Array.isArray(status?.activeItems) ? status.activeItems : []
    const results = Array.isArray(status?.results) ? status.results : []

    for (const ack of Array.isArray(status?.acks) ? status.acks : []) {
        applyCommandAck(context, ack)
    }

    for (const item of queuedItems) {
        mergeDiscoveredJob(context, item, JOB_STATE_QUEUED)
    }
    for (const item of activeItems) {
        mergeDiscoveredJob(context, item, JOB_STATE_RUNNING)
    }
    for (const item of results) {
        const nextState = item.status === 'success' ? JOB_STATE_SUCCEEDED : JOB_STATE_FAILED
        const job = mergeDiscoveredJob(context, item, nextState)
        job.error = item.status === 'failed' ? item.error || 'Unknown error' : null
        job.result = {
            ...(job.result || {}),
            status: item.status,
            format: item.format,
            size: item.size,
            timestamp: item.timestamp
        }
    }

    const queuedIds = new Set(queuedItems.map((item) => item.jobId || item.url))
    const activeIds = new Set(activeItems.map((item) => item.jobId || item.url))
    const resultIds = new Set(results.map((item) => item.jobId || item.url))

    for (const job of context.jobs.values()) {
        if (job.state === JOB_STATE_DELETED || job.state === JOB_STATE_DELETING) continue
        if (resultIds.has(job.jobId)) continue
        if (activeIds.has(job.jobId)) {
            job.state = JOB_STATE_RUNNING
            job.updatedAt = Date.now()
            continue
        }
        if (queuedIds.has(job.jobId)) {
            job.state = JOB_STATE_QUEUED
            job.updatedAt = Date.now()
            continue
        }
        if (job.state === JOB_STATE_RUNNING || job.state === JOB_STATE_QUEUED) {
            job.state = JOB_STATE_WAITING_EXTENSION
            job.updatedAt = Date.now()
        }
    }

    const clientId = clientMeta.clientId || 'unknown'
    context.state.clients[clientId] = {
        clientId,
        extensionId: clientMeta.extensionId || clientId,
        extensionVersion: clientMeta.extensionVersion || 'unknown',
        userAgent: clientMeta.userAgent || '',
        lastSeenAt: Date.now()
    }

    context.state.lastSnapshot = {
        receivedAt: Date.now(),
        status
    }

    const missingResultJobIds = []
    for (const summary of results) {
        const jobId = summary.jobId || summary.url
        const job = context.jobs.get(jobId)
        if (!job) {
            missingResultJobIds.push(jobId)
            continue
        }
        const hasPersistedArtifacts = job.result && (job.result.metaPath || job.result.filePath || job.result.status === 'failed')
        if (
            !job.result
            || job.result.timestamp !== summary.timestamp
            || job.result.status !== summary.status
            || !hasPersistedArtifacts
        ) {
            missingResultJobIds.push(jobId)
        }
    }

    await Promise.all([
        persistState(context),
        ...Array.from(context.jobs.values()).map((job) => persistJob(context, job))
    ])

    return missingResultJobIds
}

async function ingestBridgeResult(context, result) {
    const jobId = result.jobId || result.url
    const existing = context.jobs.get(jobId) || createJobRecord({
        jobId,
        url: result.url,
        title: result.title,
        taskType: result.taskType,
        format: result.format,
        options: result.options || {}
    }, {
        origin: 'extension',
        state: result.status === 'success' ? JOB_STATE_SUCCEEDED : JOB_STATE_FAILED
    })

    existing.jobId = jobId
    existing.state = result.status === 'success' ? JOB_STATE_SUCCEEDED : JOB_STATE_FAILED
    existing.source = {
        url: result.url,
        title: result.title
    }
    existing.taskType = result.taskType
    existing.format = result.format
    existing.updatedAt = Date.now()
    existing.error = result.status === 'failed' ? result.error || 'Unknown error' : null

    const resultDir = makeResultDir(context, jobId)
    await removePath(resultDir)
    await ensureLayout({
        ...context.layout,
        baseDir: context.layout.baseDir,
        jobsDir: context.layout.jobsDir,
        resultsDir: context.layout.resultsDir,
        runDir: context.layout.runDir
    })
    await fsp.mkdir(resultDir, { recursive: true })

    const meta = {
        jobId,
        url: result.url,
        title: result.title,
        taskType: result.taskType,
        format: result.format,
        status: result.status,
        resultKind: result.resultKind || (result.format === 'pdf' ? 'pdf' : 'content'),
        size: result.size || 0,
        timestamp: result.timestamp || Date.now(),
        error: result.error || null
    }

    let filePath = null
    let imagesPath = null

    if (result.status === 'success' && result.resultKind === 'content') {
        const ext = TEXT_FORMAT_EXTENSION_MAP[result.format] || '.txt'
        const filename = `${sanitizeFileComponent(result.title)}${ext}`
        filePath = path.join(resultDir, filename)
        await writeText(filePath, String(result.content || ''))
        if (Array.isArray(result.images) && result.images.length > 0) {
            imagesPath = path.join(resultDir, 'images.json')
            await writeJson(imagesPath, result.images)
        }
    } else if (result.status === 'success' && result.resultKind === 'pdf') {
        filePath = path.join(resultDir, `${sanitizeFileComponent(result.title)}.pdf`)
        const pdfBuffer = Buffer.from(normalizeBase64Payload(result.content), 'base64')
        await writeBinary(filePath, pdfBuffer)
    } else if (result.status === 'success' && result.resultKind === 'archive') {
        if (result.archiveBase64) {
            const archiveName = result.archiveName || `${sanitizeFileComponent(result.title)}.zip`
            filePath = path.join(resultDir, archiveName)
            const archiveBuffer = Buffer.from(normalizeBase64Payload(result.archiveBase64), 'base64')
            await writeBinary(filePath, archiveBuffer)
        }
    }

    const metaPath = path.join(resultDir, 'result.json')
    await writeJson(metaPath, {
        ...meta,
        filePath,
        imagesPath
    })

    existing.result = {
        ...meta,
        filePath,
        imagesPath,
        metaPath
    }

    await persistJob(context, existing)
    return existing
}

async function parseJsonBody(request) {
    const chunks = []
    for await (const chunk of request) {
        chunks.push(chunk)
    }
    if (!chunks.length) return {}
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8'
    })
    response.end(`${JSON.stringify(payload)}\n`)
}

async function handleRequest(context, request, response) {
    const parsedUrl = new URL(request.url, daemonBaseUrl(context.config))
    const pathname = parsedUrl.pathname
    const method = request.method || 'GET'

    if (method === 'GET' && pathname === '/v1/ping') {
        return sendJson(response, 200, {
            success: true,
            pid: process.pid,
            startedAt: context.state.startedAt
        })
    }

    if (method === 'POST' && pathname === '/v1/shutdown') {
        sendJson(response, 200, { success: true })
        context.shuttingDown = true
        setTimeout(() => {
            context.server?.close(() => {
                process.exit(0)
            })
        }, 50)
        return
    }

    if (method === 'GET' && pathname === '/v1/status') {
        const clients = Object.values(context.state.clients || {})
        const primaryClient = clients.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))[0] || null
        return sendJson(response, 200, {
            success: true,
            daemon: {
                pid: process.pid,
                startedAt: context.state.startedAt,
                baseDir: context.layout.baseDir,
                pendingCommands: context.state.commands.length
            },
            extension: primaryClient ? {
                connected: isConnectedClient(primaryClient),
                ...primaryClient
            } : {
                connected: false,
                lastSeenAt: null
            },
            jobs: {
                counts: getJobCounts(context),
                total: context.jobs.size
            },
            snapshot: context.state.lastSnapshot
        })
    }

    if (method === 'POST' && pathname === '/v1/jobs') {
        const body = await parseJsonBody(request)
        return sendJson(response, 200, await submitJobs(context, body))
    }

    if (method === 'GET' && pathname === '/v1/jobs') {
        const stateFilter = parsedUrl.searchParams.get('state')
        const jobs = Array.from(context.jobs.values())
            .filter((job) => !stateFilter || job.state === stateFilter)
            .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
            .map((job) => jobResponse(job))
        return sendJson(response, 200, { success: true, jobs })
    }

    if (method === 'GET' && pathname === '/v1/results') {
        const jobs = Array.from(context.jobs.values())
            .filter((job) => job.result)
            .sort((a, b) => Number((b.result?.timestamp) || 0) - Number((a.result?.timestamp) || 0))
            .map((job) => jobResponse(job))
        return sendJson(response, 200, { success: true, results: jobs })
    }

    if (pathname.startsWith('/v1/jobs/')) {
        const [, , , rawJobId, operation] = pathname.split('/')
        const jobId = decodeURIComponent(rawJobId || '')
        const job = context.jobs.get(jobId)

        if (!job) {
            return sendJson(response, 404, { success: false, error: 'Job not found' })
        }

        if (method === 'GET' && !operation) {
            return sendJson(response, 200, { success: true, job: jobResponse(job) })
        }

        if (method === 'POST' && operation === 'retry') {
            if (job.state !== JOB_STATE_FAILED) {
                return sendJson(response, 400, { success: false, error: 'Only failed jobs can be retried' })
            }

            queueCommand(context, 'RETRY_BATCH_ITEM', {
                action: 'RETRY_BATCH_ITEM',
                jobId: job.jobId,
                url: job.source.url
            })
            job.state = JOB_STATE_ACCEPTED
            job.error = null
            job.updatedAt = Date.now()
            await Promise.all([persistJob(context, job), persistState(context)])
            return sendJson(response, 200, { success: true, job: jobResponse(job) })
        }

        if (method === 'DELETE' && !operation) {
            queueCommand(context, 'DELETE_BATCH_ITEM', {
                action: 'DELETE_BATCH_ITEM',
                jobId: job.jobId,
                url: job.source.url
            })
            job.state = JOB_STATE_DELETING
            job.updatedAt = Date.now()
            await Promise.all([persistJob(context, job), persistState(context)])
            return sendJson(response, 200, { success: true, job: jobResponse(job) })
        }

        return sendJson(response, 405, { success: false, error: `Unsupported job operation: ${method} ${pathname}` })
    }

    if (method === 'GET' && pathname.startsWith('/v1/results/')) {
        const [, , , rawJobId] = pathname.split('/')
        const jobId = decodeURIComponent(rawJobId || '')
        const inline = parsedUrl.searchParams.get('inline') === '1'
        const job = context.jobs.get(jobId)
        if (!job || !job.result) {
            return sendJson(response, 404, { success: false, error: 'Result not found' })
        }

        let inlinePayload = null
        if (inline && job.result.filePath) {
            const binary = !String(job.result.filePath).endsWith('.md')
                && !String(job.result.filePath).endsWith('.html')
                && !String(job.result.filePath).endsWith('.csv')
                && !String(job.result.filePath).endsWith('.json')
            const content = await fsp.readFile(job.result.filePath, binary ? undefined : 'utf8')
            inlinePayload = binary
                ? { encoding: 'base64', data: content.toString('base64') }
                : { encoding: 'utf8', data: String(content) }
        }

        return sendJson(response, 200, {
            success: true,
            result: {
                ...jobResponse(job, true),
                inline: inlinePayload
            }
        })
    }

    if (method === 'POST' && pathname === '/v1/queue/pause') {
        await queueGlobalCommand(context, 'PAUSE_BATCH')
        return sendJson(response, 200, { success: true })
    }

    if (method === 'POST' && pathname === '/v1/queue/resume') {
        await queueGlobalCommand(context, 'RESUME_BATCH')
        return sendJson(response, 200, { success: true })
    }

    if (method === 'POST' && pathname === '/v1/queue/clear') {
        await queueGlobalCommand(context, 'CLEAR_BATCH_RESULTS')
        return sendJson(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/v1/bridge/commands') {
        const clientId = parsedUrl.searchParams.get('client_id')
        if (!clientId) {
            return sendJson(response, 400, { success: false, error: 'client_id is required' })
        }
        return sendJson(response, 200, {
            success: true,
            commands: await claimBridgeCommands(context, clientId)
        })
    }

    if (method === 'POST' && pathname === '/v1/bridge/sync') {
        const body = await parseJsonBody(request)
        const client = body.client || {}
        const acks = Array.isArray(body.acks) ? body.acks : []
        for (const ack of acks) {
            applyCommandAck(context, ack)
        }
        const missingResultJobIds = await syncJobsFromBridgeStatus(context, {
            ...(body.status || {}),
            acks
        }, client)
        return sendJson(response, 200, {
            success: true,
            missingResultJobIds
        })
    }

    if (method === 'POST' && pathname === '/v1/bridge/results') {
        const body = await parseJsonBody(request)
        const results = Array.isArray(body.results) ? body.results : []
        const stored = []
        for (const result of results) {
            const job = await ingestBridgeResult(context, result)
            stored.push(job.jobId)
        }
        return sendJson(response, 200, { success: true, storedJobIds: stored })
    }

    return sendJson(response, 404, { success: false, error: `Route not found: ${method} ${pathname}` })
}

async function shutdownCleanup(context) {
    try {
        await removePath(context.layout.pidFile)
    } catch (_) {
        // ignore
    }
}

export async function startDaemonServer({ host = DEFAULT_HOST, port = DEFAULT_PORT, baseDir = resolveHomeDir() } = {}) {
    const context = await loadContext({ host, port, baseDir })
    const server = http.createServer((request, response) => {
        Promise.resolve(handleRequest(context, request, response))
            .catch((error) => {
                sendJson(response, 500, {
                    success: false,
                    error: error?.message || String(error)
                })
            })
    })

    context.server = server

    process.on('SIGINT', async () => {
        await shutdownCleanup(context)
        process.exit(0)
    })
    process.on('SIGTERM', async () => {
        await shutdownCleanup(context)
        process.exit(0)
    })
    process.on('exit', () => {
        try {
            fs.rmSync(context.layout.pidFile, { force: true })
        } catch (_) {
            // ignore
        }
    })

    await new Promise((resolve) => {
        server.listen(port, host, resolve)
    })

    await writeText(context.layout.pidFile, JSON.stringify({
        pid: process.pid,
        host,
        port,
        home: context.layout.baseDir,
        startedAt: context.state.startedAt
    }))
    return { context, server }
}

function parseServeArgs(argv) {
    const options = {
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        home: resolveHomeDir()
    }

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (token === '--host') options.host = argv[index + 1] || options.host
        if (token === '--port') options.port = Number(argv[index + 1] || options.port)
        if (token === '--home') options.home = argv[index + 1] || options.home
    }

    return options
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] === currentFile) {
    const args = parseServeArgs(process.argv.slice(2))
    startDaemonServer({
        host: args.host,
        port: args.port,
        baseDir: args.home
    }).catch((error) => {
        console.error('[cexd] failed to start:', error)
        process.exit(1)
    })
}
