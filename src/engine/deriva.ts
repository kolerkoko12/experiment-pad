import { findOption } from './catalog'
import { variationClause } from './variations'
import type { Block, CameraOp, Catalog } from './types'
import type { BrainParamValues } from './brains'

export type CanvasSize = {
  id: string
  width: number
  height: number
  label: string
  family: 'square' | 'portrait' | 'landscape'
}

/** Safe Comfy sizes (múltiplos de 64, ≤2048). No inventamos lienzos raros. */
export const COMFY_CANVAS_SIZES: CanvasSize[] = [
  { id: 'sq-1024', width: 1024, height: 1024, label: 'cuadrado 1024×1024', family: 'square' },
  { id: 'port-832', width: 832, height: 1216, label: 'retrato 832×1216', family: 'portrait' },
  { id: 'land-1216', width: 1216, height: 832, label: 'paisaje 1216×832', family: 'landscape' },
  { id: 'port-896', width: 896, height: 1152, label: 'retrato 896×1152', family: 'portrait' },
  { id: 'land-1152', width: 1152, height: 896, label: 'paisaje 1152×896', family: 'landscape' },
  { id: 'port-768', width: 768, height: 1344, label: 'alto 768×1344', family: 'portrait' },
  { id: 'land-1344', width: 1344, height: 768, label: 'ancho 1344×768', family: 'landscape' },
]

const CAMERA_OPS: CameraOp[] = ['fixed', 'zoom-in', 'zoom-out']

export const DERIVA_PATH_HINT =
  'A veces el desvío es el camino. Ancla lo que late y pulsa Deriva: misma combo, otro marco.'

export function canvasToResolution(size: CanvasSize): string {
  return `${size.width}x${size.height}`
}

export function canvasFromParams(
  params: BrainParamValues | null | undefined,
): CanvasSize | undefined {
  if (!params) return undefined
  const fromWH = matchSize(Number(params.width), Number(params.height))
  if (fromWH) return fromWH
  const raw = String(params.resolution ?? '')
  const match = raw.match(/(\d+)\s*[x×]\s*(\d+)/i)
  if (!match) return undefined
  return matchSize(Number(match[1]), Number(match[2]))
}

function matchSize(width: number, height: number): CanvasSize | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
  return COMFY_CANVAS_SIZES.find((item) => item.width === width && item.height === height)
}

export function pickRandomCanvas(
  rng: () => number = Math.random,
  avoid?: { width: number; height: number },
): CanvasSize {
  const pool =
    avoid != null
      ? COMFY_CANVAS_SIZES.filter(
          (item) => item.width !== avoid.width || item.height !== avoid.height,
        )
      : COMFY_CANVAS_SIZES
  const list = pool.length > 0 ? pool : COMFY_CANVAS_SIZES
  return list[Math.floor(rng() * list.length)] ?? COMFY_CANVAS_SIZES[0]
}

export function applyRandomCanvas(
  params: BrainParamValues,
  rng: () => number = Math.random,
): { params: BrainParamValues; size: CanvasSize } {
  const current = canvasFromParams(params)
  const size = pickRandomCanvas(rng, current)
  return {
    size,
    params: {
      ...params,
      resolution: canvasToResolution(size),
      width: size.width,
      height: size.height,
    },
  }
}

export function pickRandomCameraOp(
  rng: () => number = Math.random,
  avoid?: CameraOp,
): CameraOp {
  const pool = CAMERA_OPS.filter((op) => op !== avoid)
  const list = pool.length > 0 ? pool : CAMERA_OPS
  return list[Math.floor(rng() * list.length)] ?? 'fixed'
}

/** Misma opción anclada; rota el detalle raro (el «error» que abre otro horizonte). */
export function driftVariations(blocks: Block[], catalog: Catalog): Block[] {
  return blocks.map((block) => {
    if (block.value?.kind !== 'option') return block
    const option = findOption(catalog, block.type, block.value.optionId)
    if (!option) return block
    return {
      ...block,
      meta: {
        ...block.meta,
        variation: variationClause(option, block.type, catalog, true),
      },
    }
  })
}

export function canvasLabel(size: CanvasSize | undefined): string {
  return size?.label ?? '1024×1024'
}
