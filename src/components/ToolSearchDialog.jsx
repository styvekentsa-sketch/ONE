import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, CornerDownLeft, Search, X } from 'lucide-react'
import { tools } from '../data/tools'

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Palette de recherche d'outil (Ctrl/⌘ K). Plein écran sur mobile, fenêtre
 * centrée sur ordinateur. Flèches haut/bas pour parcourir, Entrée pour
 * ouvrir, Échap pour fermer.
 */
export default function ToolSearchDialog({ open, onClose: closeDialog }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const onClose = () => {
    setQuery('')
    setActive(0)
    closeDialog()
  }

  const translated = useMemo(
    () =>
      tools.map((tool) => ({
        ...tool,
        label: t(`tools.${tool.id}.name`, tool.name),
        summary: t(`tools.${tool.id}.description`, tool.description),
        group: tool.mediaType === 'pdf' ? t(`categories.${tool.category}`, tool.category) : t(`mediaTypes.${tool.mediaType}`),
      })),
    [t],
  )

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return translated
    const terms = q.split(/\s+/)
    return translated
      .map((tool) => {
        const name = normalize(tool.label)
        const haystack = `${name} ${normalize(tool.summary)} ${normalize(tool.group)}`
        if (!terms.every((term) => haystack.includes(term))) return null
        return { tool, score: name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2 }
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.tool)
  }, [query, translated])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const timer = setTimeout(() => inputRef.current?.focus(), 30)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (tool) => {
    onClose()
    navigate(tool.route)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      choose(results[active])
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center md:p-6 md:pt-[12vh]" role="dialog" aria-modal="true" aria-label={t('search.open')}>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 animate-fade-in bg-stone-950/40 backdrop-blur-sm" />
      <div
        onKeyDown={onKeyDown}
        className="relative flex h-dvh w-full animate-scale-in flex-col overflow-hidden bg-stone-50 md:h-auto md:max-h-[70vh] md:max-w-xl md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl dark:bg-stone-900 md:dark:border-stone-800"
      >
        <div className="flex items-center gap-2 border-b border-stone-200 px-3 pt-[env(safe-area-inset-top)] dark:border-stone-800">
          <Search size={19} className="ml-1 shrink-0 text-stone-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-white"
          />
          <button type="button" onClick={onClose} className="flex h-10 items-center rounded-lg px-2.5 text-sm font-medium text-brand-600 md:hidden dark:text-brand-400">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="hidden h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 md:flex dark:hover:bg-stone-800">
            <X size={17} />
          </button>
        </div>

        <ul ref={listRef} className="flex-1 overflow-y-auto p-2" role="listbox" aria-label={t('nav.tools')}>
          {results.length === 0 && <li className="px-3 py-10 text-center text-sm text-stone-500 dark:text-stone-400">{t('search.noResults')}</li>}
          {results.map((tool, i) => {
            const Icon = tool.icon
            const selected = i === active
            return (
              <li key={tool.id} role="option" aria-selected={selected} data-index={i}>
                <button
                  type="button"
                  onClick={() => choose(tool)}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${selected ? 'bg-stone-200/70 dark:bg-stone-800' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-stone-950 dark:text-stone-200 dark:ring-stone-800">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900 dark:text-white">{tool.label}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{tool.group}</span>
                  </span>
                  {selected ? (
                    <CornerDownLeft size={15} className="hidden shrink-0 text-stone-400 md:block" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-stone-300 md:hidden dark:text-stone-600" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
