import { readFileSync } from 'node:fs'
import {
  applySemanticScene,
  buildSemanticScene,
  compatibilityCheck,
  expandConsequences,
  indexPiloto,
  normalizePiloto,
  pickConcept,
  renderConceptPrompt,
  seedUnlockedWithConcept,
} from '../src/engine/coherent.ts'
import { randomizeUnlocked } from '../src/engine/combination.ts'
import type { Block, Catalog } from '../src/engine/types.ts'

const raw = JSON.parse(readFileSync(new URL('../data/concepts-piloto.json', import.meta.url), 'utf8'))
const piloto = normalizePiloto(raw)
if (!piloto) throw new Error('normalizePiloto failed')
const graph = indexPiloto(piloto)

function rngSeq(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[i % values.length] ?? 0.5
    i += 1
    return v
  }
}

const catalog = {
  blockTypes: [
    { id: 'scene', label: 'Escena', shortLabel: 'E', color: '#0', weight: 1, order: 0, exportRole: 'setting' },
    { id: 'character', label: 'P', shortLabel: 'P', color: '#0', weight: 1, order: 1, exportRole: 'subject' },
    { id: 'physique', label: 'C', shortLabel: 'C', color: '#0', weight: 1, order: 2, exportRole: 'body' },
    { id: 'clothing', label: 'R', shortLabel: 'R', color: '#0', weight: 1, order: 3, exportRole: 'wardrobe' },
    { id: 'lighting', label: 'L', shortLabel: 'L', color: '#0', weight: 1, order: 4, exportRole: 'light' },
    { id: 'camera', label: 'Cam', shortLabel: 'Cam', color: '#0', weight: 1, order: 5, exportRole: 'camera' },
  ],
  optionsByType: {
    scene: [{ id: 'desert-camp', label: 'Desierto', prompt: 'desert', weight: 1, tags: ['nature', 'night', 'raw'] }],
    character: [{ id: 'athletic-woman', label: 'M', prompt: 'woman', weight: 1, tags: ['athletic'] }],
    physique: [{ id: 'toned-olive', label: 'T', prompt: 'toned', weight: 1, tags: ['athletic'] }],
    clothing: [{ id: 'wet-shirt', label: 'W', prompt: 'wet shirt', weight: 1, tags: ['water'] }],
    lighting: [{ id: 'moon-hard', label: 'Moon', prompt: 'moon', weight: 1, tags: ['night'] }],
    camera: [{ id: '35mm-cine', label: '35', prompt: '35mm', weight: 1, tags: [] }],
  },
  models: [],
  loras: [],
  mage: { defaultPlanId: 'proPlus', helpUrl: '', assistantUrl: '', analysisStubUrl: '', plans: [] },
  glossary: [],
  spicy: {
    levels: [{ id: 0, label: 'n', prompt: '' }],
    exaggeration: { body: [''], scene: [''] },
    extras: {
      futanari: { label: '', prompt: '', hook: true },
      fluids: { label: '', prompt: '', hook: true },
    },
  },
  variations: { byType: {}, byOption: {} },
} as Catalog

function blank(type: string, locked = false): Block {
  return {
    id: `block-${type}`,
    type,
    label: type,
    color: '#0',
    locked,
    weight: 1,
    value: null,
    meta: {},
  }
}

const piscina = graph.byId.get('piscina')
if (!piscina) throw new Error('missing piscina')
const expanded = expandConsequences([piscina], graph, { rng: rngSeq([0.01, 0.2, 0.4, 0.9]), maxExtra: 6 })
const ids = expanded.map((c) => c.id)
if (!ids.includes('piscina')) throw new Error('seed missing')
if (!ids.includes('lluvia') && !ids.includes('reflejos') && !ids.includes('agua')) {
  throw new Error(`expected wet/reflection consequences, got ${ids.join(',')}`)
}
const text = renderConceptPrompt(expanded)
if (!/pool|rain|water|reflect/i.test(text)) throw new Error(`prompt not coherent: ${text}`)

const picked = pickConcept(graph, { rng: () => 0.01, preferBlockType: 'scene' })
if (!picked || !picked.blockTypes.includes('scene')) throw new Error('pickConcept failed')

const green = compatibilityCheck(piscina, {
  lockedIds: new Set(),
  lockedTags: new Set(['water', 'night']),
  graph,
})
if (green !== 'green') throw new Error(`expected green, got ${green}`)
const yellow = compatibilityCheck(piscina, {
  lockedIds: new Set(),
  lockedTags: new Set(['studio', 'editorial']),
  graph,
})
if (yellow !== 'yellow') throw new Error(`expected yellow, got ${yellow}`)

const unlocked = ['scene', 'character', 'physique', 'clothing', 'lighting', 'camera'].map((t) => blank(t))
const rolled = randomizeUnlocked(unlocked, catalog, rngSeq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]), {
  piloto,
  useCoherentPilot: true,
})
const scene = rolled.find((b) => b.type === 'scene')
if (scene?.value?.kind !== 'custom') throw new Error('scene should be custom piloto text')
if (scene.meta.coherent !== true) throw new Error('scene should be marked coherent')
if (!/pool|rain|night|water/i.test(scene.value.text)) throw new Error(`scene text weak: ${scene.value.text}`)
const lighting = rolled.find((b) => b.type === 'lighting')
if (lighting?.value?.kind === 'custom' && lighting.meta.coherent === true) {
  if (!/reflect|humid|moisture/i.test(lighting.value.text)) {
    throw new Error(`lighting missing wet/reflection: ${lighting.value.text}`)
  }
}
const character = rolled.find((b) => b.type === 'character')
if (character?.value?.kind !== 'option') throw new Error('character should stay on option path')

const lockedScene = rolled.map((b) =>
  b.type === 'scene' ? { ...b, locked: true } : b,
)
const afterLock = randomizeUnlocked(lockedScene, catalog, rngSeq([0.8, 0.15, 0.4, 0.9]), {
  piloto,
  useCoherentPilot: true,
})
const still = afterLock.find((b) => b.type === 'scene')
if (JSON.stringify(still?.value) !== JSON.stringify(scene?.value)) {
  throw new Error('locked scene changed')
}

const seeded = seedUnlockedWithConcept(unlocked, catalog, piloto, 'piscina', () => 0.1)
const seededScene = seeded.find((b) => b.type === 'scene')
if (seededScene?.value?.kind !== 'custom' || !seededScene.value.text.includes('pool')) {
  throw new Error('seed piscina failed')
}

const sceneBuilt = buildSemanticScene(unlocked, graph, catalog, () => 0.2)
if (applySemanticScene(unlocked, sceneBuilt, graph).find((b) => b.locked)) {
  /* no-op, just using apply */
}
if (sceneBuilt.active.length === 0) throw new Error('empty semantic scene')

console.log('ok', {
  ids,
  scene: scene.value.kind === 'custom' ? scene.value.text : '',
  lighting: lighting?.value?.kind === 'custom' ? lighting.value.text : lighting?.value,
  compatibility: scene.meta.compatibility,
})
