import type { Catalog, Intensity, PromptSegment } from '@/engine'
import { intensityTint } from '@/engine'

type PromptSegmentsProps = {
  segments: PromptSegment[]
  empty: boolean
  bodyLevel: Intensity
  sceneLevel: Intensity
  onAffect: (kind: 'body' | 'scene') => void
}

export function PromptSegments({
  segments,
  empty,
  bodyLevel,
  sceneLevel,
  onAffect,
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
              className="rounded-md px-0.5 text-left"
              style={{
                color: segment.color,
                background: clickable ? intensityTint(level) : 'transparent',
              }}
              title={
                clickable
                  ? 'Exageración (beta): toca para subir intensidad cuerpo/escena'
                  : segment.label
              }
            >
              {segment.text}
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
