import type { PromptState, SavedTemplate, TemplateFolder } from './types'

const STORAGE_KEY = 'control-experimental.templates.v2'
const LEGACY_KEY = 'control-experimental.templates.v1'
const AUTOSAVE_ID = '__autosave'
const DEFAULT_FOLDER = 'folder-general'

type Store = {
  folders: TemplateFolder[]
  templates: SavedTemplate[]
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function defaultFolders(): TemplateFolder[] {
  return [{ id: DEFAULT_FOLDER, name: 'General' }]
}

function emptyStore(): Store {
  return { folders: defaultFolders(), templates: [] }
}

function migrateLegacy(): Store {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as SavedTemplate[]
    if (!Array.isArray(parsed)) return emptyStore()
    return {
      folders: defaultFolders(),
      templates: parsed.map((item) => ({
        ...item,
        folderId: item.folderId ?? DEFAULT_FOLDER,
      })),
    }
  } catch {
    return emptyStore()
  }
}

function readStore(): Store {
  if (!canUseStorage()) return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const migrated = migrateLegacy()
      writeStore(migrated)
      return migrated
    }
    const parsed = JSON.parse(raw) as Store
    if (!parsed.folders?.length) parsed.folders = defaultFolders()
    if (!Array.isArray(parsed.templates)) parsed.templates = []
    return parsed
  } catch {
    return emptyStore()
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listFolders(): TemplateFolder[] {
  return readStore().folders
}

export function listTemplates(): SavedTemplate[] {
  return readStore().templates
}

export function createFolder(name: string): TemplateFolder {
  const store = readStore()
  const folder: TemplateFolder = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Sin nombre',
  }
  writeStore({ ...store, folders: [...store.folders, folder] })
  return folder
}

export function renameFolder(id: string, name: string): TemplateFolder[] {
  const store = readStore()
  const folders = store.folders.map((folder) =>
    folder.id === id ? { ...folder, name: name.trim() || folder.name } : folder,
  )
  writeStore({ ...store, folders })
  return folders
}

export function deleteFolder(id: string): Store {
  const store = readStore()
  if (id === DEFAULT_FOLDER) return store
  const folders = store.folders.filter((folder) => folder.id !== id)
  const templates = store.templates.map((item) =>
    item.folderId === id ? { ...item, folderId: DEFAULT_FOLDER } : item,
  )
  const next = { folders: folders.length ? folders : defaultFolders(), templates }
  writeStore(next)
  return next
}

export function saveTemplate(name: string, state: PromptState, folderId: string): SavedTemplate {
  const store = readStore()
  const entry: SavedTemplate = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Sin nombre',
    folderId: store.folders.some((folder) => folder.id === folderId) ? folderId : DEFAULT_FOLDER,
    savedAt: new Date().toISOString(),
    state: { ...state, updatedAt: new Date().toISOString() },
  }
  writeStore({
    folders: store.folders,
    templates: [entry, ...store.templates.filter((item) => item.id !== AUTOSAVE_ID)],
  })
  return entry
}

export function renameTemplate(id: string, name: string): SavedTemplate[] {
  const store = readStore()
  const templates = store.templates.map((item) =>
    item.id === id ? { ...item, name: name.trim() || item.name } : item,
  )
  writeStore({ ...store, templates })
  return templates
}

export function moveTemplate(id: string, folderId: string): SavedTemplate[] {
  const store = readStore()
  const templates = store.templates.map((item) => (item.id === id ? { ...item, folderId } : item))
  writeStore({ ...store, templates })
  return templates
}

export function deleteTemplate(id: string): SavedTemplate[] {
  const store = readStore()
  const templates = store.templates.filter((item) => item.id !== id)
  writeStore({ ...store, templates })
  return templates
}

export function autosave(state: PromptState): void {
  if (!canUseStorage()) return
  const store = readStore()
  const entry: SavedTemplate = {
    id: AUTOSAVE_ID,
    name: 'Sesión automática',
    folderId: DEFAULT_FOLDER,
    savedAt: new Date().toISOString(),
    state: { ...state, updatedAt: new Date().toISOString() },
  }
  writeStore({
    folders: store.folders,
    templates: [entry, ...store.templates.filter((item) => item.id !== AUTOSAVE_ID)],
  })
}

export function loadAutosave(): SavedTemplate | undefined {
  return listTemplates().find((item) => item.id === AUTOSAVE_ID)
}

export { AUTOSAVE_ID, DEFAULT_FOLDER }
