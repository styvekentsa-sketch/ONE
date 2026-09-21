import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import fr from './locales/fr.json'
import en from './locales/en.json'
import es from './locales/es.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'es'],
    interpolation: {
      escapeValue: false, // React échappe déjà le HTML.
    },
    detection: {
      // Une langue choisie manuellement (localStorage) prime sur celle du
      // navigateur, qui elle-même prime sur le fallback français.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'one-language',
    },
  })

// Synchronise l'attribut lang du document avec la langue active : requis
// pour l'accessibilité (WCAG 3.1.1, prononciation correcte par les lecteurs
// d'écran) et pour que les moteurs de recherche / agents IA indexant la
// page connaissent sa langue réelle plutôt que le "en" figé du HTML statique.
const syncDocumentLang = (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
i18n.on('languageChanged', syncDocumentLang)
if (i18n.resolvedLanguage) syncDocumentLang(i18n.resolvedLanguage)

export default i18n
