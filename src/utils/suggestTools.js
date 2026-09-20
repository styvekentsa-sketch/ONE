import { tools } from '../data/tools'

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic']
const WORD_EXT = ['doc', 'docx']

function getExtension(filename) {
  return filename.split('.').pop().toLowerCase()
}

function findTool(id) {
  return tools.find((t) => t.id === id)
}

/**
 * Suggère un outil principal + des alternatives selon le type des fichiers déposés.
 * Retourne { primary, secondary } où primary peut être null si aucune règle ne correspond.
 */
export function suggestTools(files) {
  if (!files || files.length === 0) return { primary: null, secondary: [] }

  const extensions = files.map((file) => getExtension(file.name))
  const allPdf = extensions.every((ext) => ext === 'pdf')
  const allImages = extensions.every((ext) => IMAGE_EXT.includes(ext))
  const hasWord = extensions.some((ext) => WORD_EXT.includes(ext))

  if (allImages) {
    return {
      primary: findTool('jpg-to-pdf'),
      secondary: [findTool('compress')].filter(Boolean),
    }
  }

  if (allPdf) {
    if (files.length > 1) {
      return {
        primary: findTool('merge'),
        secondary: [findTool('compress'), findTool('organize')].filter(Boolean),
      }
    }
    return {
      primary: findTool('compress'),
      secondary: [findTool('protect'), findTool('sign'), findTool('pdf-to-word')].filter(Boolean),
    }
  }

  if (hasWord) {
    return {
      primary: findTool('word-to-pdf'),
      secondary: [findTool('compress')].filter(Boolean),
    }
  }

  return {
    primary: null,
    secondary: [findTool('merge'), findTool('compress'), findTool('sign')].filter(Boolean),
  }
}
