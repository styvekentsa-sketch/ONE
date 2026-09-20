import { Component } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Filet de sécurité React : sans ce composant, une erreur non interceptée
 * dans N'IMPORTE QUEL outil (canvas, décodage fichier, etc.) fait planter
 * tout l'arbre React au-dessus d'elle en écran blanc. React ne propose pas
 * de hook équivalent — une classe avec `getDerivedStateFromError` est la
 * seule API qui intercepte ces erreurs de rendu.
 *
 * `resetKey` (généralement le pathname de la route) permet de sortir de
 * l'état d'erreur automatiquement dès que l'utilisateur change de page,
 * sans avoir besoin de recharger tout l'onglet.
 */
export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Erreur interceptée par ErrorBoundary :', error, info)
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={26} />
          </span>
          <div>
            <p className="font-semibold text-zinc-800 dark:text-white">Une erreur est survenue</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Cet outil a rencontré un problème inattendu. Vos fichiers n'ont jamais quitté votre appareil — vous
              pouvez réessayer ou revenir à l'accueil en toute sécurité.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-all duration-200 ease-in-out hover:border-zinc-300 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-300"
            >
              <RotateCcw size={14} /> Réessayer
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              Retour à l'accueil
            </Link>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
