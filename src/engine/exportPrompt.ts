import { findModel, findOption } from './catalog'
import { selectedLoraTokens } from './loras'
import { exaggerationClauses, spicyClause } from './spicy'
import { variationClause } from './variations'
import type { AffectKind, Block, Catalog, PromptDelta, PromptSegment, PromptState } from './types'

const CAMERA_OPS: Record<PromptState['cameraOp'], string> = {
  fixed: 'locked focal length, no zoom',
  'zoom-in': 'slow zoom in, tightening on the subject',
  'zoom-out': 'slow zoom out, revealing the environment',
}

export function blockPromptText(block: Block, catalog: Catalog): string {
  if (!block.value) return ''
  if (block.value.kind === 'custom') return block.value.text.trim()
  const option = findOption(catalog, block.type, block.value.optionId)
  if (!option) return ''
  const stored = typeof block.meta.variation === 'string' ? block.meta.variation : ''
  const extra = stored || variationClause(option, block.type, catalog, false)
  return extra ? `${option.prompt.trim()}, ${extra}` : option.prompt.trim()
}

function affectFor(type: string): AffectKind {
  if (type === 'physique' || type === 'clothing' || type === 'character') return 'body'
  if (type === 'scene' || type === 'lighting') return 'scene'
  return 'none'
}

export function buildSegments(state: PromptState, catalog: Catalog): PromptSegment[] {
  const segments: PromptSegment[] = []

  for (const block of state.blocks) {
    let text = blockPromptText(block, catalog)
    if (!text) continue
    if (block.type === 'camera') {
      text = `${text}, ${CAMERA_OPS[state.cameraOp]}`
    }
    segments.push({
      id: block.id,
      type: block.type,
      label: block.label,
      color: block.color,
      text,
      affect: affectFor(block.type),
      coherent: block.meta.coherent === true,
    })
  }

  for (const token of selectedLoraTokens(state, catalog)) {
    segments.push({
      id: `lora-${token}`,
      type: 'lora',
      label: 'LoRA',
      color: '#C4B5FD',
      text: token,
      affect: 'none',
    })
  }

  const spicy = spicyClause(state, catalog)
  if (spicy) {
    segments.push({
      id: 'spicy',
      type: 'spicy',
      label: 'Picante',
      color: '#FB7185',
      text: spicy,
      affect: 'none',
    })
  }

  exaggerationClauses(state, catalog).forEach((text, index) => {
    segments.push({
      id: `exag-${index}`,
      type: 'exaggeration',
      label: 'Exageración',
      color: '#FBBF24',
      text,
      affect: index === 0 ? 'body' : 'scene',
    })
  })

  const model = findModel(catalog, state.selectedModelId)
  const suffix = model?.exportSuffix?.trim() ?? ''
  if (suffix) {
    segments.push({
      id: 'suffix',
      type: 'model',
      label: model?.name ?? 'Modelo',
      color: '#94A3B8',
      text: suffix,
      affect: 'none',
    })
  }

  return segments
}

export function exportPrompt(state: PromptState, catalog: Catalog): string {
  const segments = buildSegments(state, catalog)
  const phrases = segments.map((item) => item.text).filter(Boolean)
  const model = findModel(catalog, state.selectedModelId)
  const style = model?.promptStyle ?? 'natural'

  if (style === 'instruction') {
    return `Keep the current subject and setting unless I change them. Apply this look: ${phrases.join('; ')}.`.trim()
  }
  return phrases.join(', ')
}

export function exportPromptbox(state: PromptState, catalog: Catalog): string {
  return buildSegments(state, catalog)
    .map((item) => item.text)
    .filter(Boolean)
    .join('\n')
}

export function promptIsEmpty(state: PromptState, catalog: Catalog): boolean {
  return buildSegments(state, catalog).length === 0
}

function splitPhrases(prompt: string): string[] {
  return prompt
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Comma-clause diff so the UI can flash what the last edit added or removed. */
export function promptPhraseDelta(prev: string, next: string): PromptDelta {
  if (prev === next) return { added: [], removed: [] }
  const before = splitPhrases(prev)
  const after = splitPhrases(next)
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: after.filter((phrase) => !beforeSet.has(phrase)),
    removed: before.filter((phrase) => !afterSet.has(phrase)),
  }
}
