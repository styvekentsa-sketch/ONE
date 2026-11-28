import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleX,
  Download,
  FileCheck,
  FileText,
  Info,
  Layers,
  LoaderCircle,
  Paperclip,
  ScanLine,
  ShieldCheck,
  Sliders,
  Unlock,
  X,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { auditPdf, convertToPdfa } from '../../utils/pdfaWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'
import { saveFile } from '../../utils/download'

const STEPS = { UPLOAD: 'upload', ANALYZING: 'analyzing', CONFIGURE: 'configure', PROCESSING: 'processing', DONE: 'done' }
const LEVEL_IDS = ['1b', '2b', '3b']
const DPI_OPTIONS = [200, 300]
const RELATIONSHIPS = ['Source', 'Data', 'Alternative', 'Supplement', 'Unspecified']

const inputClass =
  'h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 focus:border-brand-500 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100'

function Card({ icon: Icon, title, children, aside }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-white">
          <Icon size={16} className="text-brand-600 dark:text-brand-400" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const STATUS_STYLES = {
  ok: { icon: CheckCircle2, className: 'text-brand-600 dark:text-brand-400' },
  warn: { icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  fail: { icon: CircleX, className: 'text-red-600 dark:text-red-400' },
}

/** Liste des contrôles de l'audit, avant ou après conversion. */
function CheckList({ checks, p, showFix = true }) {
  return (
    <ul className="divide-y divide-stone-100 dark:divide-stone-800">
      {checks.map((check) => {
        const { icon: Icon, className } = STATUS_STYLES[check.status]
        const detailKey = check.status === 'ok' ? 'ok' : 'issue'
        return (
          <li key={check.id} className="flex items-start gap-3 py-2.5">
            <Icon size={18} className={`mt-0.5 shrink-0 ${className}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{p(`checks.${check.id}.label`)}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {p(`checks.${check.id}.${detailKey}`, { count: check.count ?? 0, detail: check.detail ?? '' })}
                {check.id === 'xmp' && check.status !== 'ok' && check.detail && ` (${p(`checks.xmp.state.${check.detail}`)})`}
              </p>
            </div>
            {showFix && check.fix && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  check.fix === 'auto'
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                }`}
              >
                {p(`fix.${check.fix}`)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function PdfToPdfaTool() {
  const { t } = useTranslation()
  const p = (key, opts) => t(`tools.pdfa.${key}`, opts)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [bytes, setBytes] = useState(null)
  const [level, setLevel] = useState('2b')
  const [audit, setAudit] = useState(null)
  const [mode, setMode] = useState('structural')
  const [dpi, setDpi] = useState(300)
  const [meta, setMeta] = useState({ title: '', author: '', subject: '', keywords: '', creator: '' })
  const [attachments, setAttachments] = useState([])
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const attachRef = useRef(null)

  // L'audit dépend du niveau visé (transparence, pièces jointes) : on le
  // relance à chaque changement de niveau.
  useEffect(() => {
    if (!bytes) return undefined
    let cancelled = false
    auditPdf(bytes.slice(), level)
      .then((report) => !cancelled && setAudit(report))
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [bytes, level])

  const handleFiles = async (files) => {
    const [pdf] = files
    if (!(pdf.type === 'application/pdf' || pdf.name.toLowerCase().endsWith('.pdf'))) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setStep(STEPS.ANALYZING)
    try {
      const data = new Uint8Array(await pdf.arrayBuffer())
      const report = await auditPdf(data.slice(), level)
      setFile(pdf)
      setBytes(data)
      setAudit(report)
      setMeta({
        title: report.info.title || pdf.name.replace(/\.pdf$/i, ''),
        author: report.info.author,
        subject: report.info.subject,
        keywords: report.info.keywords,
        creator: report.info.creator,
      })
      setMode(report.needsRaster ? 'raster' : 'structural')
      setStep(STEPS.CONFIGURE)
    } catch (err) {
      console.error(err)
      setError(p('errors.read'))
      setStep(STEPS.UPLOAD)
    }
  }

  const addAttachments = async (e) => {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    const loaded = await Promise.all(
      list.map(async (f) => ({ id: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, mimeType: f.type, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()), relationship: 'Source' })),
    )
    setAttachments((current) => [...current, ...loaded.filter((a) => !current.some((c) => c.id === a.id))])
  }

  const handleConvert = async () => {
    setStep(STEPS.PROCESSING)
    setProgress(0)
    setError(null)
    try {
      const { bytes: out, log } = await convertToPdfa(bytes.slice(), {
        level,
        mode,
        dpi,
        meta: { ...meta, creationDate: audit.info.creationDate },
        attachments: level === '3b' ? attachments : [],
        onProgress: setProgress,
      })
      const finalAudit = await auditPdf(out.slice(), level)
      const blob = new Blob([out], { type: 'application/pdf' })
      setResult({ blob, log, audit: finalAudit, name: `${file.name.replace(/\.pdf$/i, '')}_PDFA.pdf` })
      addHistoryEntry({
        toolId: 'pdfa',
        toolName: p('name'),
        message: p('historyMessage', { name: file.name, level: `PDF/A-${level.toUpperCase()}` }),
      })
      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(mode === 'raster' ? p('errors.raster') : p('errors.convert'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const download = () => {
    saveFile(result.blob, result.name)
  }

  const restart = () => {
    setFile(null)
    setBytes(null)
    setAudit(null)
    setResult(null)
    setAttachments([])
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const levelLabel = `PDF/A-${level.toUpperCase()}`
  const structuralDisabled = audit?.isEncrypted
  const remaining = result?.audit.checks.filter((c) => c.status !== 'ok') ?? []
  const sizeDelta = result ? Math.round((result.blob.size / file.size - 1) * 100) : 0

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm sm:h-14 sm:w-14 dark:bg-stone-800/80 dark:text-white">
          <Archive size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl dark:text-white">{p('name')}</h1>
          <p className="text-sm text-stone-500 sm:text-base dark:text-stone-400">{p('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={p('dropHint')} />
        </div>
      )}

      {step === STEPS.ANALYZING && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-10 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LoaderCircle size={30} className="animate-spin text-brand-600" />
          <p className="font-semibold text-stone-900 dark:text-white">{p('analyzing')}</p>
        </div>
      )}

      {step === STEPS.CONFIGURE && audit && (
        <div className="mt-6 flex flex-col gap-5">
          {/* Fichier + statut initial */}
          <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-900">
            <FileText size={22} className="hidden shrink-0 text-stone-400 sm:block" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{file.name}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {formatBytes(file.size)} · {p('pageCount', { count: audit.pageCount })}
              </p>
            </div>
            {audit.status === 'declared' ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
                <ShieldCheck size={14} /> {p('status.declared', { level: `PDF/A-${audit.declared.part}${audit.declared.conformance}` })}
              </span>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                <AlertTriangle size={14} /> {p('status.required')}
              </span>
            )}
          </div>

          {/* Niveau ISO 19005 */}
          <Card icon={Archive} title={p('sections.level')}>
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={p('sections.level')}>
              {LEVEL_IDS.map((id) => {
                const selected = level === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLevel(id)}
                    className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                      selected
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500 dark:bg-brand-500/10'
                        : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900 dark:text-white">PDF/A-{id.toUpperCase()}</span>
                      {id === '2b' && (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{p('recommended')}</span>
                      )}
                    </span>
                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{p(`levels.${id}.standard`)}</span>
                    <span className="text-sm leading-snug text-stone-600 dark:text-stone-400">{p(`levels.${id}.description`)}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Diagnostic */}
          <Card
            icon={FileCheck}
            title={p('sections.audit', { level: levelLabel })}
            aside={<span className="hidden text-xs text-stone-500 sm:inline dark:text-stone-400">{p('auditScope')}</span>}
          >
            <CheckList checks={audit.checks} p={p} />
            {audit.isEncrypted && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center dark:bg-amber-500/10 dark:text-amber-300">
                <Unlock size={16} className="hidden shrink-0 sm:block" />
                <p className="flex-1">{p('encryptedAdvice')}</p>
                <Link to="/tool/protect-pdf?tab=unlock" className="font-semibold underline underline-offset-2">
                  {p('unlockLink')}
                </Link>
              </div>
            )}
          </Card>

          {/* Mode */}
          <Card icon={Sliders} title={p('sections.mode')}>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={p('sections.mode')}>
              {[
                { id: 'structural', icon: Layers },
                { id: 'raster', icon: ScanLine },
              ].map(({ id, icon: Icon }) => {
                const selected = mode === id
                const disabled = id === 'structural' && structuralDisabled
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => setMode(id)}
                    className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500 dark:bg-brand-500/10'
                        : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold text-stone-900 dark:text-white">
                        <Icon size={17} className={selected ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400'} />
                        {p(`modes.${id}.title`)}
                      </span>
                      {id === 'raster' && audit.needsRaster && (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{p('recommended')}</span>
                      )}
                    </span>
                    <span className="text-sm leading-snug text-stone-600 dark:text-stone-400">{p(`modes.${id}.description`)}</span>
                  </button>
                )
              })}
            </div>
            {mode === 'structural' && audit.needsRaster && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {p('structuralWarning')}
              </p>
            )}
            {mode === 'raster' && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-stone-500 dark:text-stone-400">{p('dpi')}</span>
                {DPI_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={dpi === value}
                    onClick={() => setDpi(value)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      dpi === value ? 'bg-brand-600 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300'
                    }`}
                  >
                    {value} DPI
                  </button>
                ))}
                <span className="w-full text-xs text-stone-500 dark:text-stone-400">{p('rasterNote')}</span>
              </div>
            )}
          </Card>

          {/* Métadonnées */}
          <Card icon={Info} title={p('sections.metadata')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {['title', 'author', 'subject', 'keywords', 'creator'].map((key) => (
                <label key={key} className={`flex flex-col gap-1.5 ${key === 'title' ? 'sm:col-span-2' : ''}`}>
                  <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{p(`meta.${key}`)}</span>
                  <input value={meta[key]} onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))} className={inputClass} placeholder={key === 'creator' ? 'ONE' : ''} />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
              {p('meta.dates', {
                created: audit.info.creationDate ? audit.info.creationDate.toLocaleString() : p('meta.now'),
              })}
            </p>
          </Card>

          {/* Pièces jointes PDF/A-3 */}
          {level === '3b' && (
            <Card
              icon={Paperclip}
              title={p('sections.attachments')}
              aside={
                <button
                  type="button"
                  onClick={() => attachRef.current?.click()}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  {p('attach.add')}
                </button>
              }
            >
              <input ref={attachRef} type="file" multiple className="hidden" onChange={addAttachments} />
              {attachments.length ? (
                <ul className="flex flex-col gap-2">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3 sm:flex-row sm:items-center dark:border-stone-800">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Paperclip size={15} className="shrink-0 text-stone-400" />
                        <span className="truncate text-sm text-stone-900 dark:text-stone-100">{a.name}</span>
                        <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{formatBytes(a.size)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={a.relationship}
                          aria-label={p('attach.relationship')}
                          onChange={(e) => setAttachments((list) => list.map((x) => (x.id === a.id ? { ...x, relationship: e.target.value } : x)))}
                          className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs dark:border-stone-700 dark:bg-stone-950"
                        >
                          {RELATIONSHIPS.map((rel) => (
                            <option key={rel} value={rel}>
                              {p(`attach.relationships.${rel}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                          aria-label={p('attach.remove')}
                          className="rounded-md p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-500 dark:text-stone-400">{p('attach.empty')}</p>
              )}
            </Card>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={restart} className="text-sm font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              {p('changeFile')}
            </button>
            <button
              type="button"
              onClick={handleConvert}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              <ShieldCheck size={18} /> {p('convert', { level: levelLabel })}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-10 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LoaderCircle size={30} className="animate-spin text-brand-600" />
          <p className="font-semibold text-stone-900 dark:text-white">{p('processing', { level: levelLabel })}</p>
          <div className="w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-center text-xs tabular-nums text-stone-500 dark:text-stone-400">{Math.round(progress * 100)} %</p>
          </div>
        </div>
      )}

      {step === STEPS.DONE && result && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                remaining.length ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-brand-100 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
              }`}
            >
              {remaining.length ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}
            </span>
            <p className="text-lg font-semibold text-stone-900 dark:text-white">
              {remaining.length ? p('done.partialTitle', { level: levelLabel }) : p('done.title', { level: levelLabel })}
            </p>
            <p className="max-w-xl text-sm text-stone-500 dark:text-stone-400">{remaining.length ? p('done.partialText') : p('done.text')}</p>

            <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{p('done.originalSize')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900 dark:text-white">{formatBytes(file.size)}</p>
              </div>
              <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-400">{p('done.finalSize')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900 dark:text-white">{formatBytes(result.blob.size)}</p>
                <p className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
                  {sizeDelta > 0 ? '+' : ''}
                  {sizeDelta} %
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={download}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 sm:w-auto"
            >
              <Download size={18} /> {p('done.download')}
            </button>
          </div>

          <Card icon={FileCheck} title={p('done.logTitle')}>
            <ul className="flex flex-col gap-2">
              {result.log.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                  {p(`log.${entry.id}`, entry)}
                </li>
              ))}
            </ul>
          </Card>

          <Card icon={ShieldCheck} title={p('done.auditTitle')}>
            <CheckList checks={result.audit.checks} p={p} showFix={false} />
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-stone-600 dark:bg-stone-950 dark:text-stone-400">
              <Info size={15} className="mt-px shrink-0" /> {p('done.validatorNote')}
            </p>
          </Card>

          <div className="flex justify-center gap-5 text-sm font-medium">
            <button type="button" onClick={() => setStep(STEPS.CONFIGURE)} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              {p('done.adjust')}
            </button>
            <button type="button" onClick={restart} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              {p('done.restart')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
