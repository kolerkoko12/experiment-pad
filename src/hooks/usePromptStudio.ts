import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  applyBlockValue,
  anchorFilled,
  autosave,
  blockPromptText,
  buildSegments,
  createBlocksFromCatalog,
  cycleIntensity,
  defaultExaggeration,
  effectiveLoraLimit,
  exportPrompt,
  exportPromptbox,
  findModel,
  isAtLoraLimit,
  loadAutosave,
  loadCatalog,
  mergeBlocksWithCatalog,
  migrateState,
  normalizeLoraIds,
  promptIsEmpty,
  randomizeUnlocked,
  releaseAll,
  setBlockLocked,
  suggestLorasForScene,
  type Block,
  type CameraOp,
  type Catalog,
  type ExaggerationState,
  type Intensity,
  type ParsedAssignment,
  type PromptState,
  type StudioMode,
} from '@/engine'

type Status = 'loading' | 'ready' | 'error'

export function usePromptStudio() {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedLoraIds, setSelectedLoraIds] = useState<string[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('proPlus')
  const [mode, setMode] = useState<StudioMode>('experimental')
  const [spicyLevel, setSpicyLevel] = useState<Intensity>(0)
  const [exaggeration, setExaggeration] = useState<ExaggerationState>(defaultExaggeration)
  const [cameraOp, setCameraOp] = useState<CameraOp>('fixed')
  const didInit = useRef(false)

  const hydrate = (loaded: Catalog, saved?: PromptState) => {
    const next = migrateState(saved, loaded)
    setCatalog(loaded)
    if (saved) {
      setBlocks(mergeBlocksWithCatalog(saved.blocks, loaded))
      setSelectedModelId(
        loaded.models.some((model) => model.id === saved.selectedModelId)
          ? saved.selectedModelId
          : (loaded.models[0]?.id ?? ''),
      )
      setSelectedLoraIds(normalizeLoraIds(saved.selectedLoraIds, loaded))
      setSelectedPlanId(next.selectedPlanId ?? loaded.mage.defaultPlanId)
      setMode(saved.mode)
      setSpicyLevel(next.spicyLevel ?? 0)
      setExaggeration(next.exaggeration ?? defaultExaggeration())
      setCameraOp(next.cameraOp ?? 'fixed')
    } else {
      setBlocks(randomizeUnlocked(createBlocksFromCatalog(loaded), loaded))
      setSelectedModelId(loaded.models[0]?.id ?? '')
      setSelectedPlanId(loaded.mage.defaultPlanId)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((loaded) => {
        if (cancelled) return
        hydrate(loaded, loadAutosave()?.state)
        setStatus('ready')
        didInit.current = true
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar catálogos')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const state: PromptState = useMemo(
    () => ({
      version: 2,
      blocks,
      selectedModelId,
      selectedLoraIds,
      selectedPlanId,
      mode,
      spicyLevel,
      exaggeration,
      cameraOp,
      updatedAt: new Date().toISOString(),
    }),
    [
      blocks,
      selectedModelId,
      selectedLoraIds,
      selectedPlanId,
      mode,
      spicyLevel,
      exaggeration,
      cameraOp,
    ],
  )

  useEffect(() => {
    if (!didInit.current || status !== 'ready') return
    const handle = window.setTimeout(() => autosave(state), 280)
    return () => window.clearTimeout(handle)
  }, [state, status])

  const selectedModel = catalog ? findModel(catalog, selectedModelId) : undefined
  const exported = catalog ? exportPrompt(state, catalog) : ''
  const promptbox = catalog ? exportPromptbox(state, catalog) : ''
  const segments = catalog ? buildSegments(state, catalog) : []
  const empty = catalog ? promptIsEmpty(state, catalog) : true
  const lockedCount = blocks.filter((block) => block.locked).length
  const loraMax = catalog ? effectiveLoraLimit(catalog, selectedModel, selectedPlanId) : 0
  const recommendedLoras = useMemo(
    () => (catalog ? suggestLorasForScene(state, catalog, 3) : []),
    [catalog, state],
  )

  const labelFor = useCallback(
    (block: Block) => {
      if (!catalog) return '—'
      const text = blockPromptText(block, catalog)
      if (!text) return 'Sin valor'
      if (block.value?.kind === 'custom') return block.value.text
      const option = catalog.optionsByType[block.type]?.find(
        (item) => block.value?.kind === 'option' && item.id === block.value.optionId,
      )
      return option?.label ?? text
    },
    [catalog],
  )

  return {
    status,
    error,
    catalog,
    state,
    blocks,
    mode,
    selectedModelId,
    selectedLoraIds,
    selectedPlanId,
    selectedModel,
    spicyLevel,
    exaggeration,
    cameraOp,
    exported,
    promptbox,
    segments,
    empty,
    lockedCount,
    loraMax,
    recommendedLoras,
    setMode,
    setSelectedModelId,
    setSelectedPlanId,
    setSpicyLevel,
    setCameraOp,
    setExaggerationBody: (level: Intensity) => {
      setExaggeration((current) => ({ ...current, body: level }))
    },
    setExaggerationScene: (level: Intensity) => {
      setExaggeration((current) => ({ ...current, scene: level }))
    },
    cycleAffect: (kind: 'body' | 'scene') => {
      setExaggeration((current) => ({
        ...current,
        [kind]: cycleIntensity(current[kind]),
      }))
    },
    setExtra: (key: 'futanari' | 'fluids', value: boolean) => {
      setExaggeration((current) => ({
        ...current,
        extras: { ...current.extras, [key]: value },
      }))
    },
    labelFor,
    experiment: () => {
      if (!catalog) return
      setBlocks((current) => randomizeUnlocked(current, catalog))
    },
    toggleLock: (blockId: string) => {
      setBlocks((current) => {
        const target = current.find((block) => block.id === blockId)
        if (!target) return current
        return setBlockLocked(current, blockId, !target.locked)
      })
    },
    anchorFilled: () => setBlocks((current) => anchorFilled(current)),
    releaseAll: () => setBlocks((current) => releaseAll(current)),
    setBlockValue: (blockId: string, value: Block['value']) => {
      if (!catalog) return
      setBlocks((current) => applyBlockValue(current, blockId, value, catalog))
    },
    applyParsed: (rows: ParsedAssignment[]) => {
      if (!catalog) return
      setBlocks((current) => {
        let next = current
        for (const row of rows) {
          const block = next.find((item) => item.id === row.blockId)
          if (!block || block.locked) continue
          const value = row.optionId
            ? { kind: 'option' as const, optionId: row.optionId }
            : row.custom
              ? { kind: 'custom' as const, text: row.custom }
              : null
          if (value) next = applyBlockValue(next, row.blockId, value, catalog)
        }
        return next
      })
    },
    includeLora: (id: string): 'ok' | 'blocked' => {
      if (selectedLoraIds.includes(id)) return 'ok'
      if (isAtLoraLimit(selectedLoraIds.length, loraMax) && loraMax > 0) {
        return 'blocked'
      }
      setSelectedLoraIds((current) => [...current, id])
      return 'ok'
    },
    forceIncludeLora: (id: string) => {
      setSelectedLoraIds((current) => (current.includes(id) ? current : [...current, id]))
    },
    removeLora: (id: string) => {
      setSelectedLoraIds((current) => current.filter((item) => item !== id))
    },
    clearLoras: () => setSelectedLoraIds([]),
    applySuggestedLoras: () => {
      if (!catalog) return [] as string[]
      const room = loraMax > 0 ? Math.max(0, loraMax - selectedLoraIds.length) : 2
      const picks = suggestLorasForScene(state, catalog, Math.min(2, room || 2))
      if (picks.length === 0) return []
      setSelectedLoraIds((current) => [...new Set([...current, ...picks.map((lora) => lora.id)])])
      return picks.map((lora) => lora.id)
    },
    applyState: (next: PromptState) => {
      if (!catalog) return
      hydrate(catalog, next)
    },
    resetSession: () => {
      if (!catalog) return
      setMode('experimental')
      setSelectedLoraIds([])
      setSpicyLevel(0)
      setExaggeration(defaultExaggeration())
      setCameraOp('fixed')
      setBlocks(randomizeUnlocked(createBlocksFromCatalog(catalog), catalog))
    },
    retry: () => {
      setStatus('loading')
      setError(null)
      loadCatalog()
        .then((loaded) => {
          hydrate(loaded)
          setStatus('ready')
          didInit.current = true
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Error al cargar catálogos')
          setStatus('error')
        })
    },
  }
}
