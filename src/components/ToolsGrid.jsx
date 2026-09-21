import { useTranslation } from 'react-i18next'
import { SearchX } from 'lucide-react'
import ToolCard from './ToolCard'
import EasyModeCard from './EasyModeCard'

export default function ToolsGrid({ tools, showEasyMode, onOpenAssistant }) {
  const { t } = useTranslation()

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center text-zinc-500 dark:text-zinc-400">
        <SearchX size={40} />
        <p className="text-sm">{t('search.noResults')}</p>
      </div>
    )
  }

  return (
    <div id="tools" className="grid grid-cols-1 items-stretch gap-4 px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {showEasyMode && <EasyModeCard onOpen={onOpenAssistant} />}
      {tools.map((tool, i) => (
        <ToolCard key={tool.id} tool={tool} style={{ animationDelay: `${i * 40}ms` }} />
      ))}
    </div>
  )
}
