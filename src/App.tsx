import { Anchor, Dices, FolderOpen, Loader2, RotateCcw, Unlock, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { BlockCard } from '@/components/BlockCard'
import {
  BrainPanel,
  createBrainPanelState,
  type BrainPanelState,
} from '@/components/BrainPanel'
import { CoherentPilotBar } from '@/components/CoherentPilotBar'
import { ExportBar } from '@/components/ExportBar'
import { LoraOpenButton, LoraPanel } from '@/components/LoraPanel'
import { ModeToggle } from '@/components/ModeToggle'
import { ModelPanel } from '@/components/ModelPanel'
import { OptionSheet } from '@/components/OptionSheet'
import { PromptSegments } from '@/components/PromptSegments'
import { SpicyBar } from '@/components/SpicyBar'
import { TemplateDialog } from '@/components/TemplateDialog'
import { Button } from '@/components/ui/button'
import {
  generationSizeFromBrain,
  loadBrains,
  loraKeywordText,
  promptPhraseDelta,
  suggestModelIdForBrain,
  type Block,
  type BrainUiPack,
  type LoraDef,
} from '@/engine'
import { usePromptStudio } from '@/hooks/usePromptStudio'
import { ComfyGenerateError, generateWithComfy } from '@/lib/comfyClient'

export default function App() {
  const studio = usePromptStudio()
  const [editing, setEditing] = useState<Block | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [loraOpen, setLoraOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [deltaLabel, setDeltaLabel] = useState<string | null>(null)
  const prevExported = useRef('')
  const [brainPack, setBrainPack] = useState<BrainUiPack | null>(null)
  const [brainState, setBrainState] = useState<BrainPanelState | null>(null)
  const [comfyBusy, setComfyBusy] = useState(false)
  const [comfyError, setComfyError] = useState<string | null>(null)
  const [comfyImage, setComfyImage] = useState<string | null>(null)
  const comfyAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBrains()
      .then((pack) => {
        if (cancelled) return
        setBrainPack(pack)
        setBrainState((prev) => prev ?? createBrainPanelState(pack, 'flux'))
      })
      .catch((err: unknown) => {
        console.warn('brains-ui-pack no cargó', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      comfyAbort.current?.abort()
    }
  }, [])

  // Soft-sync legacy model when brain changes (LoRA ceilings / export suffix).
  useEffect(() => {
    if (!brainState || !studio.catalog) return
    const ids = studio.catalog.models.map((m) => m.id)
    const suggested = suggestModelIdForBrain(brainState.brainId, ids)
    if (suggested && suggested !== studio.selectedModelId) {
      studio.setSelectedModelId(suggested)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainState?.brainId, studio.catalog])

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }

  useEffect(() => {
    const next = studio.exported
    const prev = prevExported.current
    prevExported.current = next
    if (!prev || !next || prev === next) return
    const delta = promptPhraseDelta(prev, next)
    const added = delta.added[0]
    const removed = delta.removed[0]
    const clip = (text: string) => (text.length > 56 ? `${text.slice(0, 56).trim()}…` : text)
    const label = added
      ? `+ ${clip(added)}`
      : removed
        ? `− ${clip(removed)}`
        : null
    if (!label) return
    setDeltaLabel(label)
    setToast(label)
    const hideChip = window.setTimeout(() => setDeltaLabel(null), 3600)
    const hideToast = window.setTimeout(() => setToast(null), 2600)
    return () => {
      window.clearTimeout(hideChip)
      window.clearTimeout(hideToast)
    }
  }, [studio.exported])

  const finalPrompt = () => {
    if (brainState?.promptDirty && brainState.promptFinal.trim()) {
      return brainState.promptFinal.trim()
    }
    return studio.exported
  }

  const copyText = async (text: string, ok: string) => {
    if (!text) {
      flash('Nada que copiar. Experimenta primero.')
      return false
    }
    try {
      await navigator.clipboard.writeText(text)
      flash(ok)
      return true
    } catch {
      flash('No se pudo copiar. Selecciona el texto abajo.')
      return false
    }
  }

  const copyLoraKeywords = async (lora: LoraDef) => {
    const text = loraKeywordText(lora)
    if (!text) {
      flash('Esta LoRA no tiene keywords.')
      return
    }
    await copyText(text, `Keywords copiadas · ${lora.name}`)
  }

  const runComfyGenerate = async () => {
    const prompt = finalPrompt().trim()
    if (!prompt) {
      flash('Nada que generar. Experimenta o escribe en Prompt Final.')
      return
    }
    comfyAbort.current?.abort()
    const controller = new AbortController()
    comfyAbort.current = controller
    setComfyBusy(true)
    setComfyError(null)
    flash('Enviando a Comfy Cloud…')
    try {
      const size = generationSizeFromBrain(brainState?.params)
      const result = await generateWithComfy(
        {
          prompt,
          negative_prompt: brainState?.negativePrompt?.trim() || undefined,
          width: size.width,
          height: size.height,
          steps: size.steps,
        },
        {
          signal: controller.signal,
          onStatus: (message) => flash(message),
        },
      )
      setComfyImage(result.imageSrc)
      flash('Imagen lista')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      const message =
        err instanceof ComfyGenerateError
          ? err.message
          : 'No se pudo generar. Revisa la Function y COMFY_CLOUD_API_KEY.'
      setComfyError(message)
      flash(message)
    } finally {
      if (comfyAbort.current === controller) {
        setComfyBusy(false)
        comfyAbort.current = null
      }
    }
  }

  const applyConcept = (conceptId: string) => {
    const concept = studio.piloto?.concepts.find((item) => item.id === conceptId)
    if (!concept) return
    studio.seedPiloto(conceptId)
    const scene = studio.blocks.find((block) => block.type === 'scene')
    flash(
      scene?.locked
        ? `Piloto: ${concept.label} (escena anclada intacta)`
        : `Piloto: ${concept.label}`,
    )
  }

  if (studio.status === 'loading') {
    return (
      <Shell>
        <p className="pt-24 text-center text-paper/60">Cargando catálogos…</p>
      </Shell>
    )
  }

  if (studio.status === 'error' || !studio.catalog) {
    return (
      <Shell>
        <div className="mx-auto mt-16 max-w-md rounded-3xl border border-rose-400/30 bg-rose-400/10 p-5 text-center">
          <p className="font-display text-2xl">No cargaron los JSON</p>
          <p className="mt-2 text-sm text-paper/70">{studio.error}</p>
          <Button className="mt-4" onClick={studio.retry}>
            Reintentar
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <div className="app-shell min-h-dvh">
      <div className="studio-layout">
        <div className="studio-main flex flex-col gap-4 px-3 pt-[max(0.9rem,env(safe-area-inset-top))] pb-6">
          <header className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.22em] text-paper/45 uppercase">
                  100% control · 100% experimental · Comfy
                </p>
                <h1 className="font-display text-[2rem] leading-[0.95] tracking-tight">
                  {studio.mode === 'experimental' ? (
                    <>
                      Experimenta.
                      <span className="block text-rose-300">Ancla lo que late.</span>
                    </>
                  ) : (
                    <>
                      Controla
                      <span className="block text-teal-300">solo lo libre.</span>
                    </>
                  )}
                </h1>
              </div>
              <div className="flex shrink-0 gap-2">
                <span className="lg:hidden">
                  <LoraOpenButton
                    count={studio.selectedLoraIds.length}
                    onClick={() => setLoraOpen(true)}
                  />
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Nueva sesión"
                  onClick={() => {
                    studio.resetSession()
                    flash('Nueva combinación')
                  }}
                >
                  <RotateCcw />
                </Button>
              </div>
            </div>
            <ModeToggle mode={studio.mode} onChange={studio.setMode} />
            <p className="text-[13px] leading-relaxed text-paper/60">
              {studio.mode === 'experimental'
                ? 'Toca el candado de un bloque que te guste. Experimentar solo mueve los libres (anti-repetición).'
                : 'Edita bloques desanclados. Los anclados no se tocan.'}{' '}
              {studio.useCoherentPilot && studio.piloto ? (
                <span className="text-teal-300/80">Piloto coherente en escena/luz/ropa/cuerpo. </span>
              ) : null}
              <span className="text-paper/40">
                {studio.lockedCount}/{studio.blocks.length} anclados
              </span>
            </p>
          </header>

          {brainPack && brainState ? (
            <BrainPanel
              pack={brainPack}
              state={brainState}
              assembledPrompt={studio.exported}
              glossary={studio.catalog.glossary}
              pilotoEnabled={studio.useCoherentPilot}
              compareOn={studio.pilotCompare?.on}
              compareOff={studio.pilotCompare?.off}
              deltaLabel={deltaLabel}
              onChange={setBrainState}
            />
          ) : (
            <p className="rounded-2xl border border-border bg-black/20 px-3 py-2 text-[12px] text-muted-foreground">
              Cargando cerebros…
            </p>
          )}

          {studio.piloto && studio.mode === 'experimental' ? (
            <CoherentPilotBar
              enabled={studio.useCoherentPilot}
              concepts={studio.piloto.concepts}
              glossary={studio.catalog.glossary}
              onToggle={studio.setUseCoherentPilot}
              onSeed={applyConcept}
            />
          ) : null}

          <ModelPanel
            catalog={studio.catalog}
            models={studio.catalog.models}
            selectedId={studio.selectedModelId}
            planId={studio.selectedPlanId}
            selectedLoraCount={studio.selectedLoraIds.length}
            onChange={studio.setSelectedModelId}
            onPlan={studio.setSelectedPlanId}
          />

          <SpicyBar
            catalog={studio.catalog}
            spicyLevel={studio.spicyLevel}
            exaggeration={studio.exaggeration}
            onSpicy={studio.setSpicyLevel}
            onBody={studio.setExaggerationBody}
            onScene={studio.setExaggerationScene}
            onExtra={studio.setExtra}
          />

          <section className="space-y-2.5" aria-label="Bloques del prompt">
            {studio.blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                summary={studio.labelFor(block)}
                mode={studio.mode}
                cameraOp={studio.cameraOp}
                onCameraOp={studio.setCameraOp}
                onToggleLock={() => studio.toggleLock(block.id)}
                onEdit={() => setEditing(block)}
              />
            ))}
          </section>

          <section className="rounded-[22px] border border-border bg-black/25 p-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Vista por bloques · Prompt Final arriba en cerebro
            </p>
            <p className="mt-1 text-[11px] text-paper/45">
              Tramos con marco teal y etiqueta «piloto» salen del motor coherente.
            </p>
            <PromptSegments
              segments={studio.segments}
              empty={studio.empty}
              bodyLevel={studio.exaggeration.body}
              sceneLevel={studio.exaggeration.scene}
              onAffect={studio.cycleAffect}
            />
            <div className="mt-3">
              <ExportBar
                catalog={studio.catalog}
                disabled={studio.empty && !brainState?.promptFinal?.trim()}
                generating={comfyBusy}
                error={comfyError}
                resultSrc={comfyImage}
                onDirect={() => {
                  void copyText(
                    finalPrompt(),
                    `Directo copiado · ${brainState?.brainId ?? studio.selectedModel?.name ?? 'Comfy'}`,
                  )
                }}
                onPromptbox={() => {
                  void copyText(studio.promptbox, 'Promptbox copiado (una línea por cláusula)')
                }}
                onGenerate={() => {
                  void runComfyGenerate()
                }}
              />
            </div>
          </section>

          <div className="h-56 lg:h-44" />
        </div>

        <LoraPanel
          catalog={studio.catalog}
          state={studio.state}
          model={studio.selectedModel}
          recommendedIds={studio.recommendedLoras.map((lora) => lora.id)}
          open={loraOpen}
          onClose={() => setLoraOpen(false)}
          onInclude={(id) => {
            const result = studio.includeLora(id)
            if (result === 'blocked') {
              flash('Tope de LoRAs. Quita una o sube de plan (upsell).')
              return 'blocked'
            }
            flash('LoRA incluida · el ensamblado se actualizó')
            return 'ok'
          }}
          onRemove={(id) => {
            studio.removeLora(id)
            flash('LoRA quitada')
          }}
          onClear={() => {
            studio.clearLoras()
            flash('LoRAs quitadas')
          }}
          onSuggest={() => {
            const ids = studio.applySuggestedLoras()
            flash(
              ids.length > 0
                ? `Sugeridas ${ids.length} por la escena anclada`
                : 'Nada claro que sugerir. Ancla bloques o elige a mano.',
            )
          }}
          onCopyKeywords={copyLoraKeywords}
        />
      </div>

      <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-ink/92 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2 lg:max-w-none lg:px-[max(0.75rem,calc((100%-36rem-22.5rem-1rem)/2))]">
          <Button
            size="lg"
            className="bg-rose-400 text-ink hover:bg-rose-300"
            onClick={() => {
              studio.experiment()
              studio.setMode('experimental')
              flash('Libres re-tirados')
            }}
          >
            <Dices />
            Experimentar
          </Button>
          <Button
            size="lg"
            className="bg-teal-300 text-ink hover:bg-teal-200"
            disabled={comfyBusy}
            onClick={() => {
              void runComfyGenerate()
            }}
          >
            {comfyBusy ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {comfyBusy ? 'Generando…' : 'Generar'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              studio.anchorFilled()
              flash('Combo anclada')
            }}
          >
            <Anchor />
            Anclar combo
          </Button>
          <Button variant="secondary" onClick={() => studio.releaseAll()}>
            <Unlock />
            Soltar todo
          </Button>
          <Button variant="outline" className="lg:hidden" onClick={() => setLoraOpen(true)}>
            LoRAs
            {studio.selectedLoraIds.length > 0 ? ` · ${studio.selectedLoraIds.length}` : ''}
          </Button>
          <Button
            variant="outline"
            className={studio.selectedLoraIds.length > 0 ? 'lg:col-span-2' : 'col-span-2'}
            onClick={() => setTemplatesOpen(true)}
          >
            <FolderOpen />
            Plantillas / carpetas
          </Button>
        </div>
      </nav>

      <OptionSheet
        block={editing}
        options={editing ? (studio.catalog.optionsByType[editing.type] ?? []) : []}
        onClose={() => setEditing(null)}
        onPick={(optionId) => {
          if (!editing) return
          studio.setBlockValue(editing.id, { kind: 'option', optionId })
          setEditing(null)
        }}
        onCustom={(text) => {
          if (!editing) return
          studio.setBlockValue(editing.id, { kind: 'custom', text })
          setEditing(null)
        }}
      />

      <TemplateDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        state={studio.state}
        onLoad={studio.applyState}
      />

      {toast ? (
        <div className="fixed top-4 right-3 left-3 z-50 mx-auto max-w-xl rounded-2xl bg-paper px-4 py-3 text-center text-sm text-ink shadow-lg lg:left-[max(0.75rem,calc((100%-36rem-22.5rem-1rem)/2))] lg:right-auto lg:w-[min(36rem,calc(100%-2rem))]">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell min-h-dvh">
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-3 pt-[max(0.9rem,env(safe-area-inset-top))] pb-6">
        {children}
      </div>
    </div>
  )
}
