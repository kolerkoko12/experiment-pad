import { applyRandomCanvas, COMFY_CANVAS_SIZES, driftVariations, pickRandomCameraOp, pickRandomCanvas } from '../src/engine/deriva.ts'
import type { Block, Catalog } from '../src/engine/types.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

for (const size of COMFY_CANVAS_SIZES) {
  assert(size.width % 64 === 0 && size.height % 64 === 0, `${size.id} must be multiple of 64`)
  assert(size.width <= 2048 && size.height <= 2048, `${size.id} too large for Function clamp`)
}

const first = pickRandomCanvas(() => 0)
const other = pickRandomCanvas(() => 0.99, first)
assert(other.width !== first.width || other.height !== first.height, 'avoid current canvas')

const rolled = applyRandomCanvas({ resolution: '1024x1024', width: 1024, height: 1024 }, () => 0.5)
assert(rolled.params.resolution === `${rolled.size.width}x${rolled.size.height}`, 'resolution string')
assert(rolled.size.width !== 1024 || rolled.size.height !== 1024, 'applyRandomCanvas leaves 1024')

assert(pickRandomCameraOp(() => 0, 'fixed') !== 'fixed', 'camera avoid')

const catalog = {
  optionsByType: {
    scene: [
      {
        id: 'desert-camp',
        label: 'Desierto',
        prompt: 'desert camp',
        weight: 1,
        tags: [],
        variations: { obvious: ['dry wind'], unusual: ['a radio still on', 'one tent unpegged'] },
      },
    ],
  },
  variations: { byType: {}, byOption: {} },
} as Catalog

const block: Block = {
  id: 'block-scene',
  type: 'scene',
  label: 'Escena',
  color: '#0',
  locked: true,
  weight: 1,
  value: { kind: 'option', optionId: 'desert-camp' },
  meta: { variation: 'dry wind' },
}

const drifted = driftVariations([block], catalog)
assert(drifted[0]?.locked === true, 'Deriva keeps the lock')
assert(drifted[0]?.value?.kind === 'option' && drifted[0].value.optionId === 'desert-camp', 'same option')
assert(typeof drifted[0]?.meta.variation === 'string' && drifted[0].meta.variation.length > 0, 'has variation')

console.log('deriva smoke: ok', { first: first.label, other: other.label, rolled: rolled.size.label })
