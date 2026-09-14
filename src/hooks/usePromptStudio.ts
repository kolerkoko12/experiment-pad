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
  loadConceptsPiloto,
  mergeBlocksWithCatalog,
  migrateState,
  normalizeLoraIds,
  pairContainsBlocks,
  promptIsEmpty,
  randomizePilotPair,
  releaseAll,
  seedUnlockedWithConcept,
  setBlockLocked,
  suggestLorasForScene,
  type Block,
  type CameraOp,
  type Catalog,
  type ConceptsPiloto,
  type ExaggerationState,
  type Intensity,
  type ParsedAssignment,
  type PromptState,
  type StudioMode,
} from '@/engine'

const COHERENT_FLAG_KEY = 'control-experimental.useCoherentPilot'

function readCoherentFlag(fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(COHERENT_FLAG_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    /* ignore */
  }
  return fallback
}

function writeCoherentFlag(value: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(COHERENT_FLAG_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

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
  const [piloto, setPiloto] = useState<ConceptsPiloto | null>(null)
  const [useCoherentPilot, setUseCoherentPilotState] = useState(true)
  const [pilotPair, setPilotPair] = useState<{ on: Block[]; off: Block[] } | null>(null)
  const [stashCompare, setStashCompare] = useState<{ on: string; off: string } | null>(null)
  const didInit = useRef(false)
  const pilotoRef = useRef<ConceptsPiloto | null>(null)
  const coherentRef = useRef(true)
  const catalogRef = useRef<Catalog | null>(null)
  const blocksRef = useRef<Block[]>([])
  const pairRef = useRef<{ on: Block[]; off: Block[] } | null>(null)
  const snapshotRef = useRef({
    selectedModelId: '',
    selectedLoraIds: [] as string[],
    selectedPlanId: 'proPlus',
    mode: 'experimental' as StudioMode,
    spicyLevel: 0 as Intensity,
    exaggeration: defaultExaggeration(),
    cameraOp: 'fixed' as CameraOp,
  })

  const exportBlocks = (nextBlocks: Block[], loaded: Catalog, snap = snapshotRef.current) =>
    exportPrompt(
      {
        version: 2,
        blocks: nextBlocks,
        selectedModelId: snap.selectedModelId,
        selectedLoraIds: snap.selectedLoraIds,
        selectedPlanId: snap.selectedPlanId,
        mode: snap.mode,
        spicyLevel: snap.spicyLevel,
        exaggeration: snap.exaggeration,
        cameraOp: snap.cameraOp,
        updatedAt: new Date().toISOString(),
      },
      loaded,
    )

  const publishPair = (
    pair: { on: Block[]; off: Block[] },
    loaded: Catalog,
    apply: 'on' | 'off' | 'none',
  ) => {
    pairRef.current = pair
    setPilotPair(pair)
    setStashCompare({ on: exportBlocks(pair.on, loaded), off: exportBlocks(pair.off, loaded) })
    if (apply === 'on') setBlocks(pair.on)
    if (apply === 'off') setBlocks(pair.off)
  }

  const dropPair = () => {
    pairRef.current = null
    setPilotPair(null)
  }

  const setUseCoherentPilot = (value: boolean) => {
    coherentRef.current = value
    setUseCoherentPilotState(value)
    writeCoherentFlag(value)
    const loaded = catalogRef.current
    if (!loaded) return
    const current = blocksRef.current
    if (pairContainsBlocks(pairRef.current, current) && pairRef.current) {
      publishPair(pairRef.current, loaded, value ? 'on' : 'off')
      return
    }
    publishPair(
      randomizePilotPair(current, loaded, pilotoRef.current, Math.random, 'piloto-types'),
      loaded,
      value ? 'on' : 'off',
    )
  }

  const hydrate = (loaded: Catalog, saved?: PromptState) => {
    const next = migrateState(saved, loaded)
    catalogRef.current = loaded
    setCatalog(loaded)
    pairRef.current = null
    setPilotPair(null)
    if (saved) {
      const restored = mergeBlocksWithCatalog(saved.blocks, loaded)
      setBlocks(restored)
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
      snapshotRef.current = {
        selectedModelId: loaded.models.some((model) => model.id === saved.selectedModelId)
          ? saved.selectedModelId
          : (loaded.models[0]?.id ?? ''),
        selectedLoraIds: normalizeLoraIds(saved.selectedLoraIds, loaded),
        selectedPlanId: next.selectedPlanId ?? loaded.mage.defaultPlanId,
        mode: saved.mode,
        spicyLevel: next.spicyLevel ?? 0,
        exaggeration: next.exaggeration ?? defaultExaggeration(),
        cameraOp: next.cameraOp ?? 'fixed',
      }
      const opposite = randomizePilotPair(
        restored,
        loaded,
        pilotoRef.current,
        Math.random,
        'piloto-types',
      )
      const pair = coherentRef.current
        ? { on: restored, off: opposite.off }
        : { on: opposite.on, off: restored }
      pairRef.current = pair
      setPilotPair(pair)
      setStashCompare({ on: exportBlocks(pair.on, loaded), off: exportBlocks(pair.off, loaded) })
    } else {
      snapshotRef.current = {
        selectedModelId: loaded.models[0]?.id ?? '',
        selectedLoraIds: [],
        selectedPlanId: loaded.mage.defaultPlanId,
        mode: 'experimental',
        spicyLevel: 0,
        exaggeration: defaultExaggeration(),
        cameraOp: 'fixed',
      }
      const pair = randomizePilotPair(
        createBlocksFromCatalog(loaded),
        loaded,
        pilotoRef.current,
        Math.random,
        'all-unlocked',
      )
      pairRef.current = pair
      setPilotPair(pair)
      setStashCompare({ on: exportBlocks(pair.on, loaded), off: exportBlocks(pair.off, loaded) })
      setBlocks(coherentRef.current ? pair.on : pair.off)
      setSelectedModelId(loaded.models[0]?.id ?? '')
      setSelectedPlanId(loaded.mage.defaultPlanId)
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([loadCatalog(), loadConceptsPiloto()])
      .then(([loaded, concepts]) => {
        if (cancelled) return
        pilotoRef.current = concepts
        setPiloto(concepts)
        const flag = readCoherentFlag(concepts?.useCoherentPilot !== false)
        coherentRef.current = flag
        setUseCoherentPilotState(flag)
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
    catalogRef.current = catalog
    blocksRef.current = blocks
    snapshotRef.current = {
      selectedModelId,
      selectedLoraIds,
      selectedPlanId,
      mode,
      spicyLevel,
      exaggeration,
      cameraOp,
    }
  }, [
    catalog,
    blocks,
    selectedModelId,
    selectedLoraIds,
    selectedPlanId,
    mode,
    spicyLevel,
    exaggeration,
    cameraOp,
  ])

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

  const pilotCompare = useMemo(() => {
    if (!catalog) return null
    const currentSnap = {
      selectedModelId,
      selectedLoraIds,
      selectedPlanId,
      mode,
      spicyLevel,
      exaggeration,
      cameraOp,
    }
    if (pilotPair) {
      return {
        on: exportBlocks(pilotPair.on, catalog, currentSnap),
        off: exportBlocks(pilotPair.off, catalog, currentSnap),
      }
    }
    if (!stashCompare) return null
    return useCoherentPilot
      ? { on: exported, off: stashCompare.off }
      : { on: stashCompare.on, off: exported }
  }, [
    catalog,
    pilotPair,
    stashCompare,
    exported,
    useCoherentPilot,
    selectedModelId,
    selectedLoraIds,
    selectedPlanId,
    mode,
    spicyLevel,
    exaggeration,
    cameraOp,
  ])

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
    piloto,
    useCoherentPilot,
    pilotCompare,
    setUseCoherentPilot,
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
      publishPair(
        randomizePilotPair(blocksRef.current, catalog, pilotoRef.current, Math.random, 'all-unlocked'),
        catalog,
        coherentRef.current ? 'on' : 'off',
      )
    },
    seedPiloto: (conceptId: string) => {
      if (!catalog || !pilotoRef.current) return
      const current = blocksRef.current
      const on = seedUnlockedWithConcept(current, catalog, pilotoRef.current, conceptId)
      const off =
        pairContainsBlocks(pairRef.current, current) && pairRef.current
          ? pairRef.current.off
          : randomizePilotPair(current, catalog, pilotoRef.current, Math.random, 'piloto-types').off
      publishPair({ on, off }, catalog, coherentRef.current ? 'on' : 'off')
    },
    toggleLock: (blockId: string) => {
      dropPair()
      setBlocks((current) => {
        const target = current.find((block) => block.id === blockId)
        if (!target) return current
        return setBlockLocked(current, blockId, !target.locked)
      })
    },
    anchorFilled: () => {
      dropPair()
      setBlocks((current) => anchorFilled(current))
    },
    releaseAll: () => {
      dropPair()
      setBlocks((current) => releaseAll(current))
    },
    setBlockValue: (blockId: string, value: Block['value']) => {
      if (!catalog) return
      dropPair()
      setBlocks((current) => applyBlockValue(current, blockId, value, catalog))
    },
    applyParsed: (rows: ParsedAssignment[]) => {
      if (!catalog) return
      dropPair()
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
      publishPair(
        randomizePilotPair(
          createBlocksFromCatalog(catalog),
          catalog,
          pilotoRef.current,
          Math.random,
          'all-unlocked',
        ),
        catalog,
        coherentRef.current ? 'on' : 'off',
      )
    },
    retry: () => {
      setStatus('loading')
      setError(null)
      Promise.all([loadCatalog(), loadConceptsPiloto()])
        .then(([loaded, concepts]) => {
          pilotoRef.current = concepts
          setPiloto(concepts)
          const flag = readCoherentFlag(concepts?.useCoherentPilot !== false)
          coherentRef.current = flag
          setUseCoherentPilotState(flag)
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
