import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tools } from '../data/tools'

/**
 * Recherche + filtrage par catégorie et par type de média (pdf/image/video/
 * audio/all), partagés entre l'accueil et les pages Outils/hubs dédiées. Les
 * noms/descriptions passent par i18next avec repli sur la valeur française
 * "source de vérité" de data/tools.js.
 */
export function useFilteredTools({ initialMediaType = 'all' } = {}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [mediaType, setMediaType] = useState(initialMediaType)

  const translatedTools = useMemo(
    () =>
      tools.map((tool) => ({
        ...tool,
        name: t(`tools.${tool.id}.name`, tool.name),
        description: t(`tools.${tool.id}.description`, tool.description),
      })),
    [t],
  )

  const filteredTools = useMemo(() => {
    return translatedTools.filter((tool) => {
      const matchesQuery =
        tool.name.toLowerCase().includes(query.toLowerCase()) ||
        tool.description.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = activeCategory === 'Tous' || tool.category === activeCategory
      const matchesMediaType = mediaType === 'all' || tool.mediaType === mediaType
      return matchesQuery && matchesCategory && matchesMediaType
    })
  }, [translatedTools, query, activeCategory, mediaType])

  const showEasyMode = query === '' && activeCategory === 'Tous'

  return {
    query,
    setQuery,
    activeCategory,
    setActiveCategory,
    mediaType,
    setMediaType,
    filteredTools,
    showEasyMode,
  }
}
