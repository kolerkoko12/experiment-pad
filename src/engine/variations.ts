import { nextUnusualIndex } from './memory'
import type { Catalog, OptionDef } from './types'

export function resolveVariations(
  option: OptionDef,
  type: string,
  catalog: Catalog,
  rotate: boolean,
) {
  const byOption = catalog.variations.byOption[option.id]
  const byType = catalog.variations.byType[type]
  const obvious = (option.variations?.obvious ?? byOption?.obvious ?? byType?.obvious ?? []).slice(
    0,
    2,
  )
  const unusualPool = option.variations?.unusual ?? byOption?.unusual ?? byType?.unusual ?? []
  let unusual: string | undefined
  if (unusualPool.length > 0) {
    const index = rotate
      ? nextUnusualIndex(`${type}:${option.id}`, unusualPool.length)
      : 0
    unusual = unusualPool[index]
  }
  return { obvious, unusual }
}

export function variationClause(
  option: OptionDef,
  type: string,
  catalog: Catalog,
  rotate: boolean,
): string {
  const { obvious, unusual } = resolveVariations(option, type, catalog, rotate)
  return [...obvious, unusual].filter((item): item is string => Boolean(item)).join(', ')
}
