import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function tint(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const n = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
