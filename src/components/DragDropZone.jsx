import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloud } from 'lucide-react'

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
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 ease-in-out active:scale-[0.99] ${
        isDragging
          ? 'scale-[1.01] border-indigo-500 bg-indigo-500/5'
          : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-zinc-600 dark:hover:bg-zinc-900'
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
        className={`flex h-16 w-16 items-center justify-center rounded-full shadow-sm transition-all duration-200 ease-in-out ${
          isDragging
            ? 'scale-110 bg-indigo-500 text-white'
            : 'bg-white text-zinc-500 group-hover:scale-105 dark:bg-zinc-800 dark:text-zinc-400'
        }`}
      >
        <UploadCloud size={28} className={isDragging ? 'animate-bounce' : ''} />
      </span>

      <div>
        <p className="font-semibold text-zinc-700 dark:text-zinc-200">
          {isDragging ? t('common.dragDropActive') : (label ?? t('common.dragDrop'))}
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {hint ?? (
            <>
              {t('common.browsePrefix')}{' '}
              <span className="font-medium text-indigo-500 dark:text-indigo-400">
                {t('common.browse')}
              </span>{' '}
              {t('common.browseSuffix')}
            </>
          )}
        </p>
      </div>
    </label>
  )
}
