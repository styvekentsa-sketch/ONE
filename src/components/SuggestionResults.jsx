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
      <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
        <span className="truncate">{fileSummary}</span>
      </div>

      {primary ? (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
            <Sparkles size={14} /> {t('common.recommendation')}
          </p>
          <button
            onClick={() => onSelectTool(primary)}
            className="group flex w-full items-center gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 text-left transition-all duration-200 ease-in-out hover:border-indigo-500/50 hover:bg-indigo-500/10 active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white">
              <primary.icon size={24} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-zinc-900 dark:text-white">
                {toolName(primary)}
              </span>
              <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                {toolDescription(primary)}
              </span>
            </span>
            <ArrowRight
              size={20}
              className="shrink-0 text-indigo-500 transition-transform group-hover:translate-x-1 dark:text-indigo-400"
            />
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-zinc-400">{t('common.noExactMatch')}</p>
      )}

      {secondary?.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {primary ? t('common.otherOptions') : t('common.suggestedTools')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {secondary.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onSelectTool(tool)}
                className="flex flex-col items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md active:scale-[0.98] dark:border-white/10 dark:bg-zinc-800/60 dark:hover:border-zinc-700"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <tool.icon size={16} />
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {toolName(tool)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onRestart}
        className="mx-auto flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <RefreshCcw size={14} /> {t('common.analyzeOtherFiles')}
      </button>
    </div>
  )
}
