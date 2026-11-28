import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FilePen, Info } from 'lucide-react'
import Modal from './Modal'
import { isNameUsed, registerDownloadPrompt, sanitizeBase, setDownloadSettings, splitName, uniqueName } from '../utils/download'

/**
 * Fenêtre « Renommer le fichier » affichée à chaque téléchargement.
 * Montée une seule fois dans l'application ; les outils l'ouvrent via saveFile().
 */
export default function DownloadNameDialog() {
  const { t } = useTranslation()
  const [request, setRequest] = useState(null) // { ext, resolve }
  const [base, setBase] = useState('')
  const [dontAsk, setDontAsk] = useState(false)
  const inputRef = useRef(null)

  useEffect(
    () =>
      registerDownloadPrompt(
        (suggested) =>
          new Promise((resolve) => {
            const { base: b, ext } = splitName(suggested)
            setBase(b)
            setDontAsk(false)
            setRequest({ ext, resolve })
          }),
      ),
    [],
  )

  // Sélectionne le nom (sans l'extension) pour une saisie immédiate.
  useEffect(() => {
    if (!request) return
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [request])

  const clean = sanitizeBase(base)
  const fullName = request ? `${clean}${request.ext}` : ''
  const finalName = clean ? uniqueName(fullName) : ''
  const renamed = clean && isNameUsed(fullName)

  const close = (value) => {
    if (!request) return
    if (value && dontAsk) setDownloadSettings({ askName: false })
    request.resolve(value)
    setRequest(null)
  }

  const submit = (event) => {
    event.preventDefault()
    if (clean) close(fullName)
  }

  return (
    <Modal
      open={request !== null}
      onClose={() => close(null)}
      icon={FilePen}
      title={t('download.title')}
      subtitle={t('download.subtitle')}
      maxWidth="max-w-md"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700 dark:text-stone-200">{t('download.label')}</span>
          <div className="flex h-12 items-center overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20 dark:border-stone-700 dark:bg-stone-950">
            <input
              ref={inputRef}
              value={base}
              onChange={(e) => setBase(e.target.value)}
              maxLength={180}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-invalid={!clean}
              className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[15px] text-stone-900 outline-none dark:text-white"
            />
            {request?.ext && (
              <span className="flex h-full items-center border-l border-stone-200 bg-stone-50 px-3 text-sm font-medium text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                {request.ext}
              </span>
            )}
          </div>
        </label>

        {!clean ? (
          <p className="text-xs text-red-600 dark:text-red-400">{t('download.empty')}</p>
        ) : renamed ? (
          <p className="flex items-start gap-2 rounded-xl bg-stone-100 p-3 text-xs leading-relaxed text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            <Info size={15} className="mt-px shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span>{t('download.alreadyUsed', { name: finalName })}</span>
          </p>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {t('download.dontAsk')}
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-stone-300 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {t('download.cancel')}
          </button>
          <button
            type="submit"
            disabled={!clean}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50"
          >
            <Download size={17} />
            {t('download.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
