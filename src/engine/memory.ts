const MEMORY_KEY = 'control-experimental.memory.v1'
const HISTORY = 6

type Memory = {
  byType: Record<string, string[]>
  unusualIndex: Record<string, number>
}

function read(): Memory {
  if (typeof localStorage === 'undefined') return { byType: {}, unusualIndex: {} }
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return { byType: {}, unusualIndex: {} }
    const parsed = JSON.parse(raw) as Memory
    return {
      byType: parsed.byType ?? {},
      unusualIndex: parsed.unusualIndex ?? {},
    }
  } catch {
    return { byType: {}, unusualIndex: {} }
  }
}

function write(memory: Memory): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory))
}

export function recentOptionIds(type: string): string[] {
  return read().byType[type] ?? []
}

export function rememberOption(type: string, optionId: string): void {
  const memory = read()
  const prev = memory.byType[type] ?? []
  memory.byType[type] = [optionId, ...prev.filter((id) => id !== optionId)].slice(0, HISTORY)
  write(memory)
}

export function nextUnusualIndex(slot: string, length: number): number {
  if (length <= 0) return 0
  const memory = read()
  const current = memory.unusualIndex[slot] ?? 0
  const next = current % length
  memory.unusualIndex[slot] = (next + 1) % length
  write(memory)
  return next
}

export function excludeRecent<T extends { id: string }>(type: string, pool: T[]): T[] {
  const recent = new Set(recentOptionIds(type))
  const filtered = pool.filter((item) => !recent.has(item.id))
  return filtered.length >= 2 ? filtered : pool
}
