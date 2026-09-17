import { readFileSync } from 'node:fs'

import { preferredComfyBrainId, type BrainUiPack } from '../src/engine/brains.ts'
import {
  comfyLoraSlotLimit,
  effectiveLoraLimit,
  loraAllowsInclude,
  loraCloudStatusCopy,
  loraIncludeKind,
  loraIsOnComfy,
  resolveLoraComfyName,
  selectedLoraCloudSplit,
  type LoraDef,
} from '../src/engine/loras.ts'
import type { Catalog, MageModel, PromptState } from '../src/engine/types.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const raw = JSON.parse(readFileSync(new URL('../data/loras.json', import.meta.url), 'utf8')) as {
  loras: Array<Partial<LoraDef> & Pick<LoraDef, 'id' | 'name'>>
}

function asLora(row: Partial<LoraDef> & Pick<LoraDef, 'id' | 'name'>): LoraDef {
  const id = row.id
  const role =
    row.role === 'checkpoint' || id === 'prefectious-xl-nsfw' || id === 'persephone-flux-nsfw'
      ? 'checkpoint'
      : 'lora'
  const pony = (row.baseModels ?? []).some((base) => base.toLowerCase().includes('pony'))
  const generar = row.generar === false || role === 'checkpoint' || pony || id.includes('klein') ? false : true
  return {
    id,
    name: row.name,
    placeholder: row.placeholder ?? false,
    source: row.source === 'imported' ? 'imported' : 'catalog',
    category: row.category ?? 'Catálogo',
    categoryColor: row.categoryColor ?? '#A78BFA',
    baseModels: row.baseModels ?? [],
    description: row.description ?? '',
    keywords: row.keywords ?? [],
    triggers: row.triggers ?? [],
    weight: row.weight ?? {
      low: 0.3,
      mid: 0.6,
      high: 0.9,
      notes: { low: '', mid: '', high: '' },
    },
    tip: row.tip ?? '',
    strengths: row.strengths ?? [],
    tags: row.tags ?? [],
    comfyName: row.comfyName,
    comfyFile: row.comfyFile,
    comfyByBrain: row.comfyByBrain,
    role,
    generar,
  }
}

const loras = raw.loras.map(asLora)
const byId = Object.fromEntries(loras.map((lora) => [lora.id, lora]))

const unmapped = byId['nsfw-master']
assert(unmapped, 'nsfw-master exists')
assert(!loraIsOnComfy(unmapped, 'flux'), 'unmapped LoRA is never green / on Cloud')
assert(resolveLoraComfyName(unmapped, 'flux') === null, 'unmapped has no Cloud filename')

const skin = byId['skin-microdetail']
assert(skin, 'skin-microdetail exists')
assert(loraIsOnComfy(skin, 'illustrious'), 'mapped skin is Cloud on Illustrious')
assert(!loraIsOnComfy(skin, 'ltx'), 'skin without ltx mapping is not Cloud for LTX')

const aidma = byId['aidma-nsfw-unlock']
assert(aidma?.comfyName === 'aidmaNSFWunlock-FLUX-V0.2.safetensors', 'verified aidma filename')
assert(loraIsOnComfy(aidma, 'illustrious'), 'comfyName counts as Cloud for the active brain')

assert(loraIncludeKind(byId['prefectious-xl-nsfw']) === 'checkpoint', 'prefectious checkpoint')
assert(loraIncludeKind(byId['persephone-flux-nsfw']) === 'checkpoint', 'persephone checkpoint')
assert(!loraAllowsInclude(byId['prefectious-xl-nsfw']), 'checkpoint cannot Incluir')
assert(loraIncludeKind(byId['futa-penis-klein']) === 'no-family', 'klein no family')
assert(loraIncludeKind(byId['sex-box-pony']) === 'no-family', 'pony no family')
assert(!loraAllowsInclude(byId['pony-anatomy']), 'pony anatomy cannot Incluir')

const catalog = {
  loras,
  models: [],
  mage: {
    defaultPlanId: 'free',
    helpUrl: '',
    assistantUrl: '',
    analysisStubUrl: '',
    plans: [{ id: 'free', name: 'Free', maxLoras: 1, note: '' }],
  },
} as unknown as Catalog

const state = {
  selectedLoraIds: ['nsfw-master', 'skin-microdetail'],
} as PromptState

const split = selectedLoraCloudSplit(state, catalog, 'illustrious')
assert(split.cloud === 1 && split.text === 1, `mixed split, got ${split.cloud}/${split.text}`)
const copy = loraCloudStatusCopy(split)
assert(copy.tone === 'mixed', `mixed tone, got ${copy.tone}`)
assert(/1 en Cloud \/ 1 solo texto/.test(copy.line), `counter copy, got ${copy.line}`)
assert(copy.tone !== 'cloud', 'mixed selection must not be green')

const onlyText = loraCloudStatusCopy({ cloud: 0, text: 1, total: 1 })
assert(onlyText.tone === 'text', 'text-only is ámbar, never green')
const onlyCloud = loraCloudStatusCopy({ cloud: 2, text: 0, total: 2 })
assert(onlyCloud.tone === 'cloud', 'all mapped is green')

const flux2 = { id: 'flux-2-dev', maxLoras: 0 } as MageModel
assert(effectiveLoraLimit(catalog, flux2, 'free') >= comfyLoraSlotLimit(), 'Mage/Flux-2 must not cap below 3')
assert(comfyLoraSlotLimit() === 3, 'Function allows 3')

const pack = {
  version: 1,
  brains: [
    { brain_id: 'flux', family: 'FLUX', modality: 'image', label: 'FLUX', negatives: { supported: false }, params: [], modes: ['i2i', 't2i'], inputs_by_mode: {} },
    { brain_id: 'illustrious', family: 'Illustrious XL', modality: 'image', label: 'Illustrious', negatives: { supported: true }, params: [], modes: ['t2i'], inputs_by_mode: {} },
    { brain_id: 'sdxl', family: 'SDXL', modality: 'image', label: 'SDXL', negatives: { supported: true }, params: [], modes: ['t2i'], inputs_by_mode: {} },
  ],
} as BrainUiPack
assert(preferredComfyBrainId(pack) === 'illustrious', 'default brain is Illustrious')

console.log('loras-ui smoke: ok')
