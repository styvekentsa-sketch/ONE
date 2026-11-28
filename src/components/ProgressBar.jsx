export default function ProgressBar({ progress, className = '' }) {
  return (
    <div
      className={`h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200 ease-out dark:bg-brand-400" style={{ width: `${progress}%` }} />
    </div>
  )
}
