import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
    DEFAULT_HOST,
    DEFAULT_PORT,
    TERMINAL_JOB_STATES,
    createId,
    createLayout,
    daemonBaseUrl,
    inferDefaultFormat,
    inferTaskTypeFromUrl,
    resolveHomeDir
} from './config.mjs'
import { copyFile, readJson } from './store.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const daemonEntry = path.join(currentDir, 'daemon-server.mjs')

function printJson(payload, pretty = false) {
    process.stdout.write(`${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`)
}

function printHelp() {
    process.stdout.write(`ContentExtract CLI

Usage:
  cex start|stop|ping
  cex daemon start|stop|ping
  cex status
  cex submit <url...> [--task-type doc|review] [--format ...] [--wait]
  cex jobs list|get|retry|delete|pause|resume
  cex results list|get
  cex fetch <job_id> [--field content|path|meta] [--raw]
  cex download <job_id> [--output <path>] [--overwrite]
`)
}

function parseArgs(argv) {
    const positional = []
    const flags = {}

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (!token.startsWith('--')) {
            positional.push(token)
            continue
        }

        const key = token.slice(2)
        const next = argv[index + 1]
        if (!next || next.startsWith('--')) {
            flags[key] = true
            continue
        }
        flags[key] = next
        index += 1
    }

    return { positional, flags }
}

async function requestJson(config, pathname, { method = 'GET', body } = {}) {
    const url = `${daemonBaseUrl(config)}${pathname}`
    const response = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    })
    const payload = await response.json()
    if (!response.ok || payload?.success === false) {
        const error = new Error(payload?.error || `HTTP ${response.status}`)
        error.payload = payload
        throw error
    }
    return payload
}

async function tryPing(config) {
    try {
        return await requestJson(config, '/v1/ping')
    } catch (_) {
        return null
    }
}

async function startDaemonDetached(config) {
    const ping = await tryPing(config)
    if (ping) {
        return { success: true, alreadyRunning: true, ping }
    }

    const layout = createLayout(config.home)
    await fsp.mkdir(layout.runDir, { recursive: true })
    const logFd = fs.openSync(layout.logFile, 'a')

    const child = spawn(process.execPath, [
        daemonEntry,
        '--host', config.host,
        '--port', String(config.port),
        '--home', config.home
    ], {
        detached: true,
        stdio: ['ignore', logFd, logFd]
    })
    child.unref()

    for (let index = 0; index < 30; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        const ready = await tryPing(config)
        if (ready) {
            return { success: true, alreadyRunning: false, ping: ready }
        }
    }

    throw new Error('Daemon did not become ready in time')
}

async function ensureDaemon(config) {
    const ping = await tryPing(config)
    if (ping) return ping
    await startDaemonDetached(config)
    return await requestJson(config, '/v1/ping')
}

async function stopDaemon(config) {
    try {
        return await requestJson(config, '/v1/shutdown', { method: 'POST' })
    } catch (error) {
        const layout = createLayout(config.home)
        const pidInfo = await readPidInfo(layout.pidFile)
        if (await isExpectedDaemonProcess(pidInfo, config)) {
            const pid = Number(pidInfo.pid)
            process.kill(pid, 'SIGTERM')
            return { success: true, forced: true, pid }
        }
        throw error
    }
}

async function readPidInfo(pidFile) {
    const raw = await fsp.readFile(pidFile, 'utf8').catch(() => '')
    const trimmed = raw.trim()
    if (!trimmed) return null

    try {
        const parsed = JSON.parse(trimmed)
        if (Number.isFinite(Number(parsed?.pid)) && Number(parsed.pid) > 0) {
            return {
                pid: Number(parsed.pid),
                host: parsed.host || null,
                port: Number.isFinite(Number(parsed.port)) ? Number(parsed.port) : null,
                home: parsed.home || null
            }
        }
    } catch (_) {
        // Fall through to the legacy plain-text pid format.
    }

    const pid = Number(trimmed)
    if (!Number.isFinite(pid) || pid <= 0) return null
    return { pid, host: null, port: null, home: null }
}

function readProcessArgs(pid) {
    try {
        const raw = fs.readFileSync(`/proc/${pid}/cmdline`)
        return raw.toString('utf8').split('\u0000').filter(Boolean)
    } catch (_) {
        const result = spawnSync('ps', ['-p', String(pid), '-o', 'args='], {
            encoding: 'utf8'
        })
        if (result.status !== 0) return null
        const command = String(result.stdout || '').trim()
        return command ? [command] : null
    }
}

function matchesArgPair(args, flag, expected) {
    if (expected === null || expected === undefined || expected === '') return true
    for (let index = 0; index < args.length; index += 1) {
        const token = args[index]
        if (token === flag && args[index + 1] === String(expected)) return true
        if (token.startsWith(`${flag}=`) && token.slice(flag.length + 1) === String(expected)) return true
        if (args.length === 1 && token.includes(`${flag} ${expected}`)) return true
        if (args.length === 1 && token.includes(`${flag}=${expected}`)) return true
    }
    return false
}

async function isExpectedDaemonProcess(pidInfo, config) {
    if (!pidInfo?.pid) return false

    try {
        process.kill(pidInfo.pid, 0)
    } catch (_) {
        return false
    }

    if (pidInfo.host && pidInfo.host !== config.host) return false
    if (pidInfo.port && pidInfo.port !== config.port) return false
    if (pidInfo.home && path.resolve(pidInfo.home) !== path.resolve(config.home)) return false

    const args = readProcessArgs(pidInfo.pid)
    if (!args?.length) return false

    const hasDaemonEntry = args.some((token) => token === daemonEntry || token.endsWith('/daemon-server.mjs') || token.includes('daemon-server.mjs'))
    if (!hasDaemonEntry) return false

    const expectedHome = pidInfo.home || config.home
    const expectedHost = pidInfo.host || config.host
    const expectedPort = pidInfo.port || config.port

    return matchesArgPair(args, '--home', expectedHome)
        && matchesArgPair(args, '--host', expectedHost)
        && matchesArgPair(args, '--port', expectedPort)
}

function buildConfig(flags) {
    return {
        host: flags.host || DEFAULT_HOST,
        port: Number(flags.port || DEFAULT_PORT),
        home: resolveHomeDir(flags.home),
        pretty: !!flags.pretty
    }
}

function buildSubmitPayload(urls, flags) {
    const sharedOptions = {}
    if (flags.foreground) sharedOptions.foreground = true
    if (flags.concurrency) sharedOptions.batchConcurrency = Number(flags.concurrency)
    if (flags['scroll-wait']) sharedOptions.scrollWaitTime = Number(flags['scroll-wait'])
    if (flags['review-min-rating']) sharedOptions.reviewMinRating = Number(flags['review-min-rating'])
    if (flags['review-with-images-only']) sharedOptions.reviewWithImagesOnly = true
    if (flags['review-max-count']) sharedOptions.reviewMaxCount = Number(flags['review-max-count'])
    if (flags['review-recent-days']) sharedOptions.reviewRecentDays = Number(flags['review-recent-days'])
    if (flags['review-max-pages']) sharedOptions.reviewMaxPages = Number(flags['review-max-pages'])
    if (flags['social-include-replies']) sharedOptions.socialIncludeReplies = flags['social-include-replies'] !== 'false'
    if (flags['social-max-count']) sharedOptions.socialMaxCount = Number(flags['social-max-count'])
    if (flags['social-max-rounds']) sharedOptions.socialMaxRounds = Number(flags['social-max-rounds'])

    const items = urls.map((url, index) => {
        const taskType = flags['task-type'] || inferTaskTypeFromUrl(url)
        return {
            url,
            title: urls.length === 1 && flags.title ? flags.title : url,
            taskType,
            format: flags.format || inferDefaultFormat(taskType),
            requestId: flags['request-id'] ? `${flags['request-id']}:${index}` : createId('req'),
            options: sharedOptions
        }
    })

    return {
        items,
        execution: {
            windowMode: !!flags['window-mode'],
            windowCount: flags['window-count'] ? Number(flags['window-count']) : undefined
        }
    }
}

async function waitForJobs(config, jobs, pretty) {
    const ids = jobs.map((job) => job.jobId)
    while (true) {
        const snapshots = await Promise.all(ids.map((jobId) => requestJson(config, `/v1/jobs/${encodeURIComponent(jobId)}`)))
        const normalized = snapshots.map((entry) => entry.job)
        if (normalized.every((job) => TERMINAL_JOB_STATES.has(job.state))) {
            printJson({ success: true, jobs: normalized }, pretty)
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
    }
}

async function commandDaemon(config, positional) {
    const action = positional[1]
    if (action === 'start') {
        const result = await startDaemonDetached(config)
        return printJson({ success: true, daemon: result }, config.pretty)
    }
    if (action === 'stop') {
        return printJson(await stopDaemon(config), config.pretty)
    }
    if (action === 'ping') {
        const ping = await tryPing(config)
        return printJson({ success: !!ping, ping }, config.pretty)
    }
    throw new Error('Unknown daemon subcommand')
}

async function commandStatus(config) {
    const ping = await tryPing(config)
    if (!ping) {
        return printJson({
            success: true,
            daemon: { connected: false },
            extension: { connected: false }
        }, config.pretty)
    }
    return printJson(await requestJson(config, '/v1/status'), config.pretty)
}

async function commandSubmit(config, positional, flags) {
    const urls = positional.slice(1)
    if (!urls.length) {
        throw new Error('submit requires at least one url')
    }
    await ensureDaemon(config)
    const response = await requestJson(config, '/v1/jobs', {
        method: 'POST',
        body: buildSubmitPayload(urls, flags)
    })
    if (flags.wait) {
        return await waitForJobs(config, response.jobs || [], config.pretty)
    }
    return printJson(response, config.pretty)
}

async function commandJobs(config, positional) {
    await ensureDaemon(config)
    const action = positional[1]

    if (action === 'list') {
        const state = positional[2]
        const suffix = state ? `?state=${encodeURIComponent(state)}` : ''
        return printJson(await requestJson(config, `/v1/jobs${suffix}`), config.pretty)
    }

    if (action === 'get') {
        const jobId = positional[2]
        if (!jobId) throw new Error('jobs get requires a job_id')
        return printJson(await requestJson(config, `/v1/jobs/${encodeURIComponent(jobId)}`), config.pretty)
    }

    if (action === 'retry') {
        const jobIds = positional.slice(2)
        if (!jobIds.length) throw new Error('jobs retry requires at least one job_id')
        const jobs = []
        for (const jobId of jobIds) {
            const result = await requestJson(config, `/v1/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })
            jobs.push(result.job)
        }
        return printJson({ success: true, jobs }, config.pretty)
    }

    if (action === 'delete') {
        const jobIds = positional.slice(2)
        if (!jobIds.length) throw new Error('jobs delete requires at least one job_id')
        const jobs = []
        for (const jobId of jobIds) {
            const result = await requestJson(config, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
            jobs.push(result.job)
        }
        return printJson({ success: true, jobs }, config.pretty)
    }

    if (action === 'pause') {
        return printJson(await requestJson(config, '/v1/queue/pause', { method: 'POST' }), config.pretty)
    }

    if (action === 'resume') {
        return printJson(await requestJson(config, '/v1/queue/resume', { method: 'POST' }), config.pretty)
    }

    throw new Error('Unknown jobs subcommand')
}

async function commandResults(config, positional, flags) {
    await ensureDaemon(config)
    const action = positional[1]

    if (action === 'list') {
        return printJson(await requestJson(config, '/v1/results'), config.pretty)
    }

    if (action === 'get') {
        const jobId = positional[2]
        if (!jobId) throw new Error('results get requires a job_id')
        const inline = flags.inline ? '?inline=1' : ''
        return printJson(await requestJson(config, `/v1/results/${encodeURIComponent(jobId)}${inline}`), config.pretty)
    }

    throw new Error('Unknown results subcommand')
}

async function commandFetch(config, positional, flags) {
    await ensureDaemon(config)
    const jobId = positional[1]
    if (!jobId) throw new Error('fetch requires a job_id')

    const payload = await requestJson(config, `/v1/results/${encodeURIComponent(jobId)}?inline=1`)
    const result = payload.result
    const field = flags.field || 'content'

    if (flags.raw) {
        if (field === 'path') {
            process.stdout.write(`${result?.result?.filePath || ''}\n`)
            return
        }
        if (field === 'meta') {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
            return
        }
        process.stdout.write(`${result?.inline?.data || ''}\n`)
        return
    }

    return printJson({
        success: true,
        jobId,
        field,
        value: field === 'path'
            ? result?.result?.filePath || null
            : field === 'meta'
                ? result
                : result?.inline || null
    }, config.pretty)
}

async function commandDownload(config, positional, flags) {
    await ensureDaemon(config)
    const jobId = positional[1]
    if (!jobId) throw new Error('download requires a job_id')

    const payload = await requestJson(config, `/v1/jobs/${encodeURIComponent(jobId)}`)
    const job = payload.job
    const sourcePath = job?.result?.filePath
    if (!sourcePath) {
        throw new Error('No downloadable file available for this job')
    }

    const targetPath = flags.output
        ? path.resolve(String(flags.output))
        : path.join(process.cwd(), path.basename(sourcePath))

    await copyFile(sourcePath, targetPath, !!flags.overwrite)
    return printJson({
        success: true,
        jobId,
        sourcePath,
        targetPath
    }, config.pretty)
}

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2))
    if (positional.length === 0 || flags.help) {
        printHelp()
        return
    }

    const config = buildConfig(flags)
    const command = positional[0]

    if (command === 'start' || command === 'stop' || command === 'ping') {
        return await commandDaemon(config, ['daemon', command])
    }
    if (command === 'daemon') return await commandDaemon(config, positional)
    if (command === 'status') return await commandStatus(config)
    if (command === 'submit') return await commandSubmit(config, positional, flags)
    if (command === 'jobs') return await commandJobs(config, positional)
    if (command === 'results') return await commandResults(config, positional, flags)
    if (command === 'fetch') return await commandFetch(config, positional, flags)
    if (command === 'download') return await commandDownload(config, positional, flags)

    throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
    printJson({
        success: false,
        error: error?.message || String(error)
    }, true)
    process.exit(1)
})
