import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Coquille de modal générique : fond flouté, échap pour fermer, scroll
 * bloqué, animations fade-in/scale-in. N'importe quelle future modal
 * (aperçu de fichier, confirmation, paramètres...) se construit en lui
 * passant juste un titre/icône et son contenu en `children`.
 */
export default function Modal({
  open,
  onClose,
  icon: Icon,
  title,
  subtitle,
  maxWidth = 'max-w-xl',
  children,
}) {
  const { t } = useTranslation()
  const dialogRef = useRef(null)

  // Piège le focus clavier à l'intérieur de la modale (sinon Tab continue
  // de naviguer dans la page derrière l'overlay, invisible mais toujours
  // atteignable) et le restitue à l'élément déclencheur à la fermeture.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement

    const getFocusable = () =>
      Array.from(dialog?.querySelectorAll(FOCUSABLE_SELECTOR) ?? []).filter(
        (el) => el.offsetParent !== null,
      )

    ;(getFocusable()[0] ?? dialog)?.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`animate-scale-in relative flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl outline-none dark:border-white/10 dark:bg-zinc-900`}
      >
        {(title || Icon) && (
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5 dark:border-white/10">
            <div className="flex items-center gap-3">
              {Icon && (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-md">
                  <Icon size={20} />
                </span>
              )}
              <div>
                {title && (
                  <h2 id="modal-title" className="font-semibold text-zinc-900 dark:text-white">
                    {title}
                  </h2>
                )}
                {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-all duration-200 ease-in-out hover:bg-zinc-100 hover:text-zinc-600 active:scale-[0.98] dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  )
}
