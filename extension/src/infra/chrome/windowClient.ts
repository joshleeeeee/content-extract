/**
 * Window Pool for multi-window batch extraction
 */

export interface WindowPool {
  windowIds: number[]
  availableWindows: Set<number>
  windowToTask: Map<number, string>
}

/**
 * Create a window pool with specified size
 */
export async function createWindowPool(size: number): Promise<WindowPool> {
  const windowIds: number[] = []
  const screen = await chrome.system.display.getInfo()
  const primaryDisplay = screen[0]
  const screenWidth = primaryDisplay.workArea.width
  const screenHeight = primaryDisplay.workArea.height

  const cols = size <= 2 ? size : 2
  const rows = Math.ceil(size / cols)
  const winWidth = Math.floor(screenWidth / cols)
  const winHeight = Math.floor(screenHeight / rows)

  for (let i = 0; i < size; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)

    const win = await chrome.windows.create({
      focused: i === 0,
      state: 'normal',
      type: 'normal',
      left: col * winWidth,
      top: row * winHeight,
      width: winWidth,
      height: winHeight
    })
    if (win?.id) {
      windowIds.push(win.id)
    }
  }

  return {
    windowIds,
    availableWindows: new Set(windowIds),
    windowToTask: new Map()
  }
}

/**
 * Close all windows in the pool
 */
export async function closeWindowPool(pool: WindowPool): Promise<void> {
  for (const windowId of pool.windowIds) {
    await chrome.windows.remove(windowId).catch(() => {})
  }
  pool.availableWindows.clear()
  pool.windowToTask.clear()
}

/**
 * Acquire an available window from the pool
 */
export function acquireWindow(pool: WindowPool, taskUrl: string): number | null {
  const windowId = pool.availableWindows.values().next().value
  if (windowId === undefined) {
    return null
  }

  pool.availableWindows.delete(windowId)
  pool.windowToTask.set(windowId, taskUrl)
  return windowId
}

/**
 * Release a window back to the pool
 */
export function releaseWindow(pool: WindowPool, windowId: number): void {
  pool.windowToTask.delete(windowId)
  if (pool.windowIds.includes(windowId)) {
    pool.availableWindows.add(windowId)
  }
}
