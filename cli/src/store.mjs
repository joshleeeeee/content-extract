import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true })
}

export async function ensureLayout(layout) {
    await Promise.all([
        ensureDir(layout.baseDir),
        ensureDir(layout.jobsDir),
        ensureDir(layout.resultsDir),
        ensureDir(layout.runDir)
    ])
}

export async function readJson(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, 'utf8')
        return JSON.parse(raw)
    } catch (error) {
        if (error && (error.code === 'ENOENT' || error.name === 'SyntaxError')) {
            return fallback
        }
        throw error
    }
}

export async function writeJson(filePath, value) {
    const tempFile = `${filePath}.tmp`
    await fs.writeFile(tempFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await fs.rename(tempFile, filePath)
}

export async function writeText(filePath, value) {
    await ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, value, 'utf8')
}

export async function writeBinary(filePath, buffer) {
    await ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, buffer)
}

export async function loadJsonMapFromDir(dirPath) {
    const map = new Map()
    let entries = []
    try {
        entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return map
        }
        throw error
    }

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const filePath = path.join(dirPath, entry.name)
        const data = await readJson(filePath, null)
        if (!data || !data.jobId) continue
        map.set(data.jobId, data)
    }
    return map
}

export async function removePath(targetPath) {
    await fs.rm(targetPath, { recursive: true, force: true })
}

export async function copyFile(sourcePath, targetPath, overwrite = false) {
    await ensureDir(path.dirname(targetPath))
    const flag = overwrite ? 0 : fsConstants.COPYFILE_EXCL
    await fs.copyFile(sourcePath, targetPath, flag)
}

export async function readFileIfExists(filePath, encoding = 'utf8') {
    try {
        return await fs.readFile(filePath, encoding)
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return null
        }
        throw error
    }
}
