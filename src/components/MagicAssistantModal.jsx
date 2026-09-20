import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScanSearch, Wand2 } from 'lucide-react'
import Modal from './Modal'
import DragDropZone from './DragDropZone'
import ProcessingState from './ProcessingState'
import SuggestionResults from './SuggestionResults'
import { suggestTools } from '../utils/suggestTools'

const STEPS = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  RESULTS: 'results',
}

export default function MagicAssistantModal({ open, onClose, onSelectTool }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.IDLE)
  const [files, setFiles] = useState([])
  const [suggestion, setSuggestion] = useState({ primary: null, secondary: [] })

  // Reset internal state whenever the modal is closed, so it reopens fresh.
  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setStep(STEPS.IDLE)
        setFiles([])
      }, 200)
      return () => clearTimeout(timeout)
    }
  }, [open])

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

  const handleSelectTool = (tool) => {
    onSelectTool?.(tool)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Wand2}
      title={t('easyModeCard.badge')}
      subtitle={t('easyModeCard.assistantSubtitle')}
    >
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
          onSelectTool={handleSelectTool}
        />
      )}
    </Modal>
  )
}
