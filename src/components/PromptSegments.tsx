import type { Catalog, Intensity, PromptSegment } from '@/engine'
import { intensityTint } from '@/engine'
import { cn } from '@/lib/utils'

type PromptSegmentsProps = {
  segments: PromptSegment[]
  empty: boolean
  bodyLevel: Intensity
  sceneLevel: Intensity
  onAffect: (kind: 'body' | 'scene') => void
  flashIds?: Set<string>
}

export function PromptSegments({
  segments,
  empty,
  bodyLevel,
  sceneLevel,
  onAffect,
  flashIds,
}: PromptSegmentsProps) {
  if (empty) {
    return (
      <p className="mt-2 text-sm text-paper/45 italic">
        Vacío. Pulsa Experimentar para armar una combo.
      </p>
    )
  }

  return (
    <p className="mt-2 text-[13px] leading-relaxed">
      {segments.map((segment, index) => {
        const clickable = segment.affect !== 'none'
        const level = segment.affect === 'body' ? bodyLevel : sceneLevel
        const coherent = segment.coherent === true
        return (
          <span key={segment.id}>
            {index > 0 ? <span className="text-paper/35">, </span> : null}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (segment.affect === 'body' || segment.affect === 'scene') {
                  onAffect(segment.affect)
                }
              }}
              className={cn(
                'rounded-md px-0.5 text-left',
                coherent && 'ring-1 ring-teal-300/70 bg-teal-300/10',
                flashIds?.has(segment.id) && 'prompt-flash',
              )}
              style={{
                color: segment.color,
                background: coherent
                  ? undefined
                  : clickable
                    ? intensityTint(level)
                    : 'transparent',
              }}
              title={
                coherent
                  ? 'Este tramo lo escribió el piloto coherente'
                  : clickable
                    ? 'Exageración (beta): toca para subir intensidad cuerpo/escena'
                    : segment.label
              }
            >
              {segment.text}
              {coherent ? (
                <span className="ml-1 align-middle text-[9px] font-semibold tracking-wide text-teal-200 uppercase">
                  piloto
                </span>
              ) : null}
            </button>
          </span>
        )
      })}
    </p>
  )
}

export function useSegments(_catalog: Catalog, segments: PromptSegment[]) {
  return segments
}
