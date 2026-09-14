import type { InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'flex min-h-12 w-full rounded-2xl border border-border bg-input px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
