/** Interrupteur on/off accessible (role="switch"), style réglages natifs. */
export default function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${
        checked ? 'bg-brand-600' : 'bg-stone-300 dark:bg-stone-700'
      }`}
    >
      <span
        className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out ${
          checked ? 'translate-x-5.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
