import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

/**
 * Rend le corps d'une section de page légale. Chaque section stocke son
 * texte en i18n sous forme de blocs séparés par une ligne vide ; un bloc
 * dont toutes les lignes commencent par "- " devient une liste à puces,
 * sinon un paragraphe. Évite de dupliquer du JSX dans chaque clé de
 * traduction tout en gardant les fichiers de langue en texte brut.
 */
function SectionBody({ text }) {
  const blocks = text.split('\n\n').filter(Boolean)

  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const isList = lines.every((line) => line.startsWith('- '))

        if (isList) {
          return (
            <ul key={i} className="my-3 list-disc space-y-1.5 pl-5">
              {lines.map((line, j) => (
                <li key={j}>{line.slice(2)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} className="my-3 first:mt-0 last:mb-0">
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

/**
 * Mise en page partagée par les 5 pages légales (mentions légales,
 * confidentialité, CGU, cookies, remboursement) : intitulé de la page comme
 * h1 unique, sommaire ancré pour navigation rapide au clavier/lecteur
 * d'écran, sections en h2, et rappel de la date de mise à jour.
 */
export default function LegalPageLayout({ title, intro, sections }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors duration-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} aria-hidden="true" /> {t('legal.meta.backToHome')}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {t('common.lastUpdatedLabel', { date: t('legal.meta.lastUpdated') })}
      </p>

      {intro && <p className="mt-6 text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{intro}</p>}

      <nav aria-label={t('legal.meta.tableOfContents')} className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-zinc-900/60">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('legal.meta.tableOfContents')}
        </p>
        <ol className="space-y-1.5 text-sm">
          {sections.map((section, i) => (
            <li key={i}>
              <a
                href={`#section-${i}`}
                className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
              >
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="mt-8 space-y-10 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-base">
        {sections.map((section, i) => (
          <section key={i} id={`section-${i}`} aria-labelledby={`heading-${i}`} className="scroll-mt-24">
            <h2 id={`heading-${i}`} className="mb-3 text-lg font-bold text-zinc-900 dark:text-white">
              {section.heading}
            </h2>
            <SectionBody text={section.body} />
          </section>
        ))}
      </article>

      <p className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        {t('legal.meta.disclaimer')}
      </p>
    </div>
  )
}
