import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderUp, UploadCloud } from 'lucide-react'

/**
 * Déduit une étiquette de formats lisible ("PDF", "JPG, PNG, WEBP"...) à
 * partir de la string `accept` déjà passée par chaque page d'outil — évite
 * d'avoir à faire porter une prop de plus par la trentaine d'appelants pour
 * que le bandeau de formats reste juste partout.
 */
function formatAcceptLabel(accept) {
  if (!accept) return null

  const labels = accept
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('.')) return part.slice(1).toUpperCase()
      if (part.endsWith('/*')) {
        const kind = part.split('/')[0]
        return kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase()
      }
      const subtype = (part.split('/')[1] ?? part).toLowerCase()
      if (subtype.includes('wordprocessingml')) return 'DOCX'
      if (subtype === 'jpeg') return 'JPG'
      return subtype.toUpperCase()
    })

  return [...new Set(labels)].join(', ')
}

export default function DragDropZone({
  onFiles,
  multiple = true,
  accept,
  label,
  hint,
  className = '',
}) {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const inputId = useRef(`dropzone-input-${Math.random().toString(36).slice(2)}`)

  // Zones secondaires/compactes (ex. "ajouter d'autres images", cases A/B
  // d'une comparaison) : elles passent déjà `hint=" "` pour masquer la
  // phrase de sous-titre — on réutilise ce même signal pour aussi masquer
  // les pastilles de formats, plutôt que d'ajouter une prop dédiée que
  // chaque appelant devrait connaître.
  const isCompact = hint !== undefined && hint.trim() === ''
  const formatsLabel = useMemo(() => formatAcceptLabel(accept), [accept])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      const dropped = Array.from(e.dataTransfer.files ?? [])
      if (dropped.length) onFiles(multiple ? dropped : [dropped[0]])
    },
    [onFiles, multiple],
  )

  const handleInputChange = useCallback(
    (e) => {
      const selected = Array.from(e.target.files ?? [])
      if (selected.length) onFiles(multiple ? selected : [selected[0]])
      e.target.value = ''
    },
    [onFiles, multiple],
  )

  return (
    <label
      htmlFor={inputId.current}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ease-in-out active:scale-[0.99] md:p-12 ${
        isDragging
          ? 'scale-[1.01] border-indigo-500 bg-indigo-50/50 ring-4 ring-indigo-500/20 dark:bg-indigo-950/20'
          : 'border-zinc-300 bg-zinc-50/80 text-zinc-800 hover:border-indigo-500 hover:bg-zinc-100/80 dark:border-zinc-700/80 dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:border-indigo-500 dark:hover:bg-zinc-900'
      } ${className}`}
    >
      <input
        id={inputId.current}
        type="file"
        multiple={multiple}
        accept={accept}
        className="sr-only"
        onChange={handleInputChange}
      />

      <span
        className={`mb-4 inline-flex items-center justify-center rounded-2xl p-4 shadow-inner transition-transform duration-200 ease-in-out ${
          isDragging
            ? 'scale-110 bg-indigo-500 text-white'
            : 'bg-indigo-50 text-indigo-600 group-hover:-translate-y-1 group-hover:scale-110 dark:bg-zinc-800 dark:text-indigo-400'
        }`}
      >
        <UploadCloud size={28} className={isDragging ? 'animate-bounce' : ''} />
      </span>

      <p className="text-lg font-bold text-zinc-900 dark:text-white">
        {isDragging ? t('common.dragDropActive') : (label ?? t('common.dragDrop'))}
      </p>

      {!isCompact && (
        <p className="mb-2 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {hint ?? t('common.chooseOptionBelow')}
        </p>
      )}

      <span className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 hover:shadow-indigo-500/40 active:scale-95">
        <FolderUp size={16} aria-hidden="true" />
        {t('common.browseFilesButton')}
      </span>

      {!isCompact && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          {formatsLabel && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium dark:bg-zinc-800">
              {t('common.acceptedFormats', { formats: formatsLabel })}
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium dark:bg-zinc-800">
            {t('common.unlimitedBadge')}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium dark:bg-zinc-800">
            {t('common.localProcessingBadge')}
          </span>
        </div>
      )}
    </label>
  )
}
