import type { Catalog, ExaggerationState, Intensity, PromptState } from './types'

export function spicyClause(state: PromptState, catalog: Catalog): string {
  const level = catalog.spicy.levels.find((item) => item.id === state.spicyLevel)
  return level?.prompt.trim() ?? ''
}

export function exaggerationClauses(state: PromptState, catalog: Catalog): string[] {
  const body = catalog.spicy.exaggeration.body[state.exaggeration.body] ?? ''
  const scene = catalog.spicy.exaggeration.scene[state.exaggeration.scene] ?? ''
  const extras: string[] = []
  if (state.exaggeration.extras.futanari) {
    extras.push(catalog.spicy.extras.futanari.prompt.trim())
  }
  if (state.exaggeration.extras.fluids) {
    extras.push(catalog.spicy.extras.fluids.prompt.trim())
  }
  return [body, scene, ...extras].filter(Boolean)
}

export function cycleIntensity(current: Intensity): Intensity {
  return ((current + 1) % 4) as Intensity
}

export function intensityTint(level: Intensity): string {
  if (level <= 0) return 'rgba(180,180,180,0.22)'
  if (level === 1) return 'rgba(125, 211, 252, 0.28)'
  if (level === 2) return 'rgba(251, 191, 36, 0.32)'
  return 'rgba(251, 113, 133, 0.38)'
}

export const emptyExaggeration = (): ExaggerationState => ({
  body: 0,
  scene: 0,
  extras: { futanari: false, fluids: false },
})
