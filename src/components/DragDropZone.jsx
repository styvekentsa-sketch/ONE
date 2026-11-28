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
      className={`group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-200 md:py-14 ${
        isDragging
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
          : 'border-stone-300 bg-white hover:border-stone-400 hover:bg-stone-50 active:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600 dark:hover:bg-stone-900/70'
      } ${className}`}
    >
      <input id={inputId.current} type="file" multiple={multiple} accept={accept} className="sr-only" onChange={handleInputChange} />

      <span
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
          isDragging ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-700 group-hover:bg-brand-50 group-hover:text-brand-700 dark:bg-stone-800 dark:text-stone-200 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-300'
        }`}
      >
        <UploadCloud size={26} strokeWidth={1.8} />
      </span>

      {/* Souris : glisser-déposer ; écran tactile : choisir un fichier. */}
      <p className="text-base font-semibold text-stone-900 pointer-coarse:hidden dark:text-white">
        {isDragging ? t('common.dragDropActive') : (label ?? t('common.dragDrop'))}
      </p>

      {!isCompact && <p className="mt-1 max-w-sm text-sm text-stone-500 pointer-coarse:mt-0 pointer-coarse:text-[15px] pointer-coarse:text-stone-700 dark:text-stone-400 dark:pointer-coarse:text-stone-300">{hint ?? t('common.chooseOptionBelow')}</p>}

      <span className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors group-hover:bg-brand-700 group-active:bg-brand-800">
        <FolderUp size={17} aria-hidden="true" />
        {t('common.browseFilesButton')}
      </span>

      {!isCompact && (
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
          {formatsLabel && <span>{t('common.acceptedFormats', { formats: formatsLabel })}</span>}
          {formatsLabel && <span aria-hidden="true">·</span>}
          <span>{t('common.unlimitedBadge')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('common.localProcessingBadge')}</span>
        </p>
      )}
    </label>
  )
}
