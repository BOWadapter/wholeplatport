'use client'

// Diálogo de confirmación mínimo (misma API que el AlertDialog de shadcn/ui).
// Cierra con Escape o al hacer clic fuera del contenido.

import { useEffect, type ReactNode } from 'react'

export function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation" onClick={() => onOpenChange(false)}>
      {children}
    </div>
  )
}

export function AlertDialogContent({ children }: { children: ReactNode }) {
  return (
    <div className="dialog-content" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      {children}
    </div>
  )
}

export function AlertDialogHeader({ children }: { children: ReactNode }) {
  return <div className="dialog-header">{children}</div>
}

export function AlertDialogTitle({ children }: { children: ReactNode }) {
  return <h2>{children}</h2>
}

export function AlertDialogDescription({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>
}

export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className="dialog-footer">{children}</div>
}

export function AlertDialogCancel({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick}>{children}</button>
}

export function AlertDialogAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="danger-btn" onClick={onClick} autoFocus>
      {children}
    </button>
  )
}
