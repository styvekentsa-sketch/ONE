import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, RefreshCcw, Sparkles } from 'lucide-react'

export default function SuggestionResults({ files, primary, secondary, onRestart, onSelectTool }) {
  const { t } = useTranslation()
  const fileSummary =
    files.length === 1 ? files[0].name : t('common.filesAnalyzed', { count: files.length })

  const toolName = (tool) => t(`tools.${tool.id}.name`, tool.name)
  const toolDescription = (tool) => t(`tools.${tool.id}.description`, tool.description)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
        <CheckCircle2 size={18} className="shrink-0 text-brand-500" />
        <span className="truncate">{fileSummary}</span>
      </div>

      {primary ? (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-brand-400">
            <Sparkles size={14} /> {t('common.recommendation')}
          </p>
          <button
            onClick={() => onSelectTool(primary)}
            className="group flex w-full items-center gap-4 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5 text-left transition-all duration-200 ease-in-out hover:border-brand-500/50 hover:bg-brand-500/10 active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <primary.icon size={24} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-stone-900 dark:text-white">
                {toolName(primary)}
              </span>
              <span className="block text-sm text-stone-500 dark:text-stone-400">
                {toolDescription(primary)}
              </span>
            </span>
            <ArrowRight
              size={20}
              className="shrink-0 text-brand-500 transition-transform group-hover:translate-x-1 dark:text-brand-400"
            />
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-stone-500 dark:text-stone-400">{t('common.noExactMatch')}</p>
      )}

      {secondary?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {primary ? t('common.otherOptions') : t('common.suggestedTools')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {secondary.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onSelectTool(tool)}
                className="flex flex-col items-start gap-2 rounded-xl border border-stone-200 bg-white p-3 text-left transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md active:scale-[0.98] dark:border-white/10 dark:bg-stone-800/60 dark:hover:border-stone-700"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  <tool.icon size={16} />
                </span>
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200">
                  {toolName(tool)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onRestart}
        className="mx-auto flex items-center gap-1.5 text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
      >
        <RefreshCcw size={14} /> {t('common.analyzeOtherFiles')}
      </button>
    </div>
  )
}
