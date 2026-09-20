export default function ProgressBar({ progress, className = '' }) {
  return (
    <div
      className={`h-2 w-64 max-w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
