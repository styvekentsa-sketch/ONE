import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ScanSearch, Wand2 } from 'lucide-react'
import DragDropZone from '../components/DragDropZone'
import ProcessingState from '../components/ProcessingState'
import SuggestionResults from '../components/SuggestionResults'
import { suggestTools } from '../utils/suggestTools'

const STEPS = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  RESULTS: 'results',
}

/** Page dédiée à l'onglet "Mode Rapide" de la barre de navigation mobile :
 * même logique de suggestion que l'Assistant Magique, en pleine page. */
export default function EasyModePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(STEPS.IDLE)
  const [files, setFiles] = useState([])
  const [suggestion, setSuggestion] = useState({ primary: null, secondary: [] })

  const handleFiles = (droppedFiles) => {
    setFiles(droppedFiles)
    setStep(STEPS.ANALYZING)
    const delay = 1500 + Math.random() * 400
    setTimeout(() => {
      setSuggestion(suggestTools(droppedFiles))
      setStep(STEPS.RESULTS)
    }, delay)
  }

  const handleRestart = () => {
    setFiles([])
    setSuggestion({ primary: null, secondary: [] })
    setStep(STEPS.IDLE)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-md">
          <Wand2 size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{t('easyModeCard.badge')}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('easyModeCard.assistantSubtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {step === STEPS.IDLE && (
          <DragDropZone onFiles={handleFiles} hint={t('easyModeCard.assistantDropHint')} />
        )}
        {step === STEPS.ANALYZING && (
          <ProcessingState
            icon={ScanSearch}
            title={t('easyModeCard.assistantAnalyzing')}
            description={
              files.length > 1
                ? t('easyModeCard.assistantAnalyzingMultiple', { count: files.length })
                : t('easyModeCard.assistantAnalyzingSingle')
            }
          />
        )}
        {step === STEPS.RESULTS && (
          <SuggestionResults
            files={files}
            primary={suggestion.primary}
            secondary={suggestion.secondary}
            onRestart={handleRestart}
            onSelectTool={(tool) => navigate(tool.route)}
          />
        )}
      </div>
    </div>
  )
}
