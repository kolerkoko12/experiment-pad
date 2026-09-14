import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-5',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border bg-transparent text-foreground',
        ghost: 'bg-transparent text-foreground',
        destructive: 'bg-destructive text-white',
      },
      size: {
        default: 'min-h-12 px-4 py-2.5',
        sm: 'min-h-10 rounded-xl px-3 text-xs',
        lg: 'min-h-14 px-5 text-base',
        icon: 'size-12 rounded-2xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
}

export { Button, buttonVariants }
