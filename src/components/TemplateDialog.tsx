import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  AUTOSAVE_ID,
  DEFAULT_FOLDER,
  createFolder,
  deleteFolder,
  deleteTemplate,
  listFolders,
  listTemplates,
  moveTemplate,
  renameFolder,
  renameTemplate,
  saveTemplate,
} from '@/engine'
import type { PromptState, SavedTemplate, TemplateFolder } from '@/engine'

type TemplateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: PromptState
  onLoad: (state: PromptState) => void
}

export function TemplateDialog({ open, onOpenChange, state, onLoad }: TemplateDialogProps) {
  const [name, setName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [folderId, setFolderId] = useState(DEFAULT_FOLDER)
  const [folders, setFolders] = useState<TemplateFolder[]>(() => listFolders())
  const [templates, setTemplates] = useState<SavedTemplate[]>(() => listTemplates())
  const [notice, setNotice] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const refresh = () => {
    setFolders(listFolders())
    setTemplates(listTemplates())
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) refresh()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogTitle>Plantillas por situación</DialogTitle>
        <DialogDescription>
          Carpetas renombrables en este iPad (localStorage). La sesión se auto-guarda.
        </DialogDescription>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            createFolder(folderName)
            setFolderName('')
            setNotice('Carpeta creada')
            refresh()
          }}
        >
          <Input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="Nueva carpeta (ej. Hotel lluvia)"
          />
          <Button type="submit" variant="secondary">
            Carpeta
          </Button>
        </form>

        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            saveTemplate(name, state, folderId)
            setName('')
            setNotice('Plantilla guardada')
            refresh()
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la combo"
          />
          <select
            className="min-h-12 rounded-2xl border border-border bg-input px-3"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <Button type="submit">Guardar en carpeta</Button>
        </form>

        {notice ? <p className="mt-2 text-sm text-teal-200">{notice}</p> : null}

        <div className="mt-4 space-y-4">
          {folders.map((folder) => {
            const items = templates.filter((item) => item.folderId === folder.id)
            return (
              <section key={folder.id}>
                <div className="mb-2 flex items-center gap-2">
                  {renaming === folder.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        renameFolder(folder.id, renameValue)
                        setRenaming(null)
                        refresh()
                      }}
                    >
                      <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                      <Button type="submit" size="sm">
                        Ok
                      </Button>
                    </form>
                  ) : (
                    <h3 className="flex-1 text-[13px] font-semibold tracking-wide uppercase">
                      {folder.name}
                    </h3>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenaming(folder.id)
                      setRenameValue(folder.name)
                    }}
                  >
                    Renombrar
                  </Button>
                  {folder.id !== DEFAULT_FOLDER ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        deleteFolder(folder.id)
                        refresh()
                      }}
                    >
                      Borrar
                    </Button>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {items.length === 0 ? (
                    <li className="text-[12px] text-muted-foreground">Vacía.</li>
                  ) : (
                    items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 rounded-2xl border border-border bg-white/3 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-paper">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(item.savedAt).toLocaleString('es')}
                              {item.id === AUTOSAVE_ID ? ' · auto' : ''}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              onLoad(item.state)
                              onOpenChange(false)
                            }}
                          >
                            Cargar
                          </Button>
                        </div>
                        {item.id !== AUTOSAVE_ID ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const next = window.prompt('Nuevo nombre', item.name)
                                if (next) {
                                  renameTemplate(item.id, next)
                                  refresh()
                                }
                              }}
                            >
                              Renombrar
                            </Button>
                            <select
                              className="min-h-10 rounded-xl border border-border bg-input px-2 text-[12px]"
                              value={item.folderId}
                              onChange={(event) => {
                                moveTemplate(item.id, event.target.value)
                                refresh()
                              }}
                            >
                              {folders.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                deleteTemplate(item.id)
                                refresh()
                              }}
                            >
                              Borrar
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
