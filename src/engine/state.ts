import { defaultExaggeration, type Catalog, type PromptState } from './types'

export function migrateState(raw: Partial<PromptState> | undefined, catalog: Catalog): Partial<PromptState> {
  if (!raw) return {}
  return {
    ...raw,
    version: 2,
    selectedLoraIds: raw.selectedLoraIds ?? [],
    selectedPlanId: raw.selectedPlanId ?? catalog.mage.defaultPlanId,
    spicyLevel: raw.spicyLevel ?? 0,
    exaggeration: raw.exaggeration ?? defaultExaggeration(),
    cameraOp: raw.cameraOp ?? 'fixed',
  }
}

export function blankExtras(catalog: Catalog, modelId: string): Pick<
  PromptState,
  'selectedLoraIds' | 'selectedPlanId' | 'spicyLevel' | 'exaggeration' | 'cameraOp'
> {
  return {
    selectedLoraIds: [],
    selectedPlanId: catalog.mage.defaultPlanId,
    spicyLevel: 0,
    exaggeration: defaultExaggeration(),
    cameraOp: 'fixed',
    ...(modelId ? {} : {}),
  }
}
