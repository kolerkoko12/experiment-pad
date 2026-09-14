import { Lock, LockOpen } from 'lucide-react'

import type { Block, StudioMode } from '@/engine'
import { tint } from '@/lib/utils'

type BlockCardProps = {
  block: Block
  summary: string
  mode: StudioMode
  cameraOp?: 'fixed' | 'zoom-in' | 'zoom-out'
  onCameraOp?: (op: 'fixed' | 'zoom-in' | 'zoom-out') => void
  onToggleLock: () => void
  onEdit: () => void
}

export function BlockCard({
  block,
  summary,
  mode,
  cameraOp,
  onCameraOp,
  onToggleLock,
  onEdit,
}: BlockCardProps) {
  const empty = summary === 'Sin valor'
  const canEdit = mode === 'control' && !block.locked

  return (
    <article
      className="flex min-h-[76px] overflow-hidden rounded-[22px] border"
      style={{
        borderColor: tint(block.color, block.locked ? 0.55 : 0.28),
        background: `linear-gradient(135deg, ${tint(block.color, 0.18)}, rgba(16,14,12,0.55))`,
      }}
    >
      <div className="w-2 shrink-0" style={{ background: block.color }} aria-hidden />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 px-3 py-3 text-left active:opacity-90"
        onClick={canEdit ? onEdit : onToggleLock}
      >
        <div className="flex w-full items-center gap-2">
          <span
            className="text-[11px] font-semibold tracking-[0.16em] uppercase"
            style={{ color: block.color }}
          >
            {block.label}
          </span>
          {block.locked ? (
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] tracking-wide text-paper/80 uppercase">
              Anclado
            </span>
          ) : (
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] tracking-wide text-paper/55 uppercase">
              Libre
            </span>
          )}
          {block.meta.coherent === true ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase ${
                block.meta.compatibility === 'red'
                  ? 'bg-rose-400/25 text-rose-200'
                  : block.meta.compatibility === 'yellow'
                    ? 'bg-amber-400/25 text-amber-200'
                    : 'bg-teal-400/25 text-teal-200'
              }`}
            >
              Piloto{' '}
              {block.meta.compatibility === 'red'
                ? 'rojo'
                : block.meta.compatibility === 'yellow'
                  ? 'ámbar'
                  : 'verde'}
            </span>
          ) : null}
        </div>
        <p
          className={`w-full text-[15px] leading-snug ${empty ? 'text-paper/40 italic' : 'text-paper'}`}
        >
          {summary}
        </p>
        {mode === 'control' && !block.locked ? (
          <span className="text-[11px] text-paper/50">Toca para editar</span>
        ) : null}
        {block.type === 'camera' && onCameraOp ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {(
              [
                ['fixed', 'Fija'],
                ['zoom-in', 'Zoom +'],
                ['zoom-out', 'Zoom −'],
              ] as const
            ).map(([op, label]) => (
              <span
                key={op}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  onCameraOp(op)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onCameraOp(op)
                }}
                className={`rounded-full px-2 py-1 text-[10px] ${
                  cameraOp === op ? 'bg-sky-300 text-ink' : 'bg-black/30 text-paper/70'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={block.locked ? `Desanclar ${block.label}` : `Anclar ${block.label}`}
        aria-pressed={block.locked}
        onClick={onToggleLock}
        className="flex size-[72px] shrink-0 flex-col items-center justify-center gap-1 border-l border-white/5"
        style={{ color: block.locked ? block.color : 'rgba(244,239,230,0.55)' }}
      >
        {block.locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
        <span className="text-[10px] tracking-wide uppercase">
          {block.locked ? 'Fijo' : 'Libre'}
        </span>
      </button>
    </article>
  )
}
