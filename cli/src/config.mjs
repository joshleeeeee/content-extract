import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const DEFAULT_PORT = Number(process.env.CONTENT_EXTRACT_CLI_PORT || 17327)
export const DEFAULT_HOST = process.env.CONTENT_EXTRACT_CLI_HOST || '127.0.0.1'
export const DEFAULT_HOME = process.env.CONTENT_EXTRACT_CLI_HOME || path.join(os.homedir(), '.content-extract-cli')
export const HEARTBEAT_TTL_MS = 95_000

export function resolveHomeDir(explicitHome) {
    return explicitHome || DEFAULT_HOME
}

export function createLayout(baseDir) {
    return {
        baseDir,
        jobsDir: path.join(baseDir, 'jobs'),
        resultsDir: path.join(baseDir, 'results'),
        runDir: path.join(baseDir, 'run'),
        stateFile: path.join(baseDir, 'daemon-state.json'),
        pidFile: path.join(baseDir, 'run', 'daemon.pid'),
        logFile: path.join(baseDir, 'run', 'daemon.log')
    }
}

export function daemonBaseUrl({ port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
    return `http://${host}:${port}`
}

export function createId(prefix = 'job') {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`
}

export function inferTaskTypeFromUrl(input) {
    try {
        const url = new URL(input)
        const host = url.hostname.toLowerCase()
        if (
            host.includes('jd.com')
            || host.includes('jd.hk')
            || host.includes('taobao.com')
            || host.includes('tmall.com')
            || host.includes('douyin.com')
            || host.includes('xiaohongshu.com')
            || host.includes('xhslink.com')
            || host.includes('bilibili.com')
            || host.includes('b23.tv')
        ) {
            return 'review'
        }
    } catch (_) {
        return 'doc'
    }
    return 'doc'
}

export function inferDefaultFormat(taskType) {
    return taskType === 'review' ? 'csv' : 'markdown'
}

export function sanitizeFileComponent(input) {
    const raw = String(input || 'document').trim()
    const cleaned = raw
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .trim()
    return cleaned || 'document'
}

export function normalizeBase64Payload(value) {
    const normalized = String(value || '')
        .trim()
        .replace(/^data:[^;]+;base64,/i, '')
        .replace(/\s+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')

    if (!normalized) return ''
    const remainder = normalized.length % 4
    return remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder)
}

export const TERMINAL_JOB_STATES = new Set(['succeeded', 'failed', 'deleted'])
