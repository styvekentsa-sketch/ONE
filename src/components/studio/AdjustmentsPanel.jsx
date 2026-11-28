import { Info } from 'lucide-react'

const PRESETS = [
  { id: 'none', label: 'Aucun' },
  { id: 'bw', label: 'Noir & blanc' },
  { id: 'sepia', label: 'Sépia' },
  { id: 'vivid', label: 'Vif' },
  { id: 'cool', label: 'Froid' },
  { id: 'warm', label: 'Chaud' },
]

function Slider({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <div>
      <label className="mb-1.5 flex justify-between text-xs font-medium text-stone-500 dark:text-stone-400">
        {label}
        <span className="font-mono text-stone-500 dark:text-stone-400">
          {value}
          {unit}
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </div>
  )
}

/**
 * Panneau "Réglages & Couleurs" — présentationnel : reçoit les valeurs
 * courantes (aperçu non destructif tant que "Appliquer" n'est pas cliqué)
 * et remonte chaque changement. Les réglages de base (luminosité,
 * contraste, saturation, teinte, flou) passent par le filtre CSS natif du
 * canvas ; netteté, niveaux, courbes, mappage dégradé et balance des
 * couleurs sont de vrais calculs pixel par pixel (voir canvasEngine.js) —
 * seules les courbes sont volontairement simplifiées (3 points plutôt
 * qu'un éditeur de points de contrôle complet).
 */
export default function AdjustmentsPanel({ values, onChange, onApplyPreset, onApply, onReset, hasSelection, applyLabel = 'Appliquer' }) {
  const set = (key) => (v) => onChange({ ...values, [key]: v })

  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-3">
      {hasSelection && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-brand-500/5 px-2.5 py-2 text-xs text-brand-600 dark:text-brand-400">
          <Info size={13} className="mt-0.5 shrink-0" />
          Les réglages ne s'appliqueront qu'à la zone sélectionnée.
        </p>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Filtres prédéfinis</p>
      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onApplyPreset(preset.id)}
            className="rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] font-medium text-stone-600 transition-colors duration-150 hover:border-brand-300 hover:text-brand-600 dark:border-stone-700 dark:text-stone-300 dark:hover:border-brand-500"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Réglages de base</p>
      <div className="flex flex-col gap-3">
        <Slider label="Luminosité" value={values.brightness} min={0} max={200} unit="%" onChange={set('brightness')} />
        <Slider label="Contraste" value={values.contrast} min={0} max={200} unit="%" onChange={set('contrast')} />
        <Slider label="Saturation" value={values.saturate} min={0} max={200} unit="%" onChange={set('saturate')} />
        <Slider label="Teinte" value={values.hueRotate} min={-180} max={180} unit="°" onChange={set('hueRotate')} />
        <Slider label="Flou" value={values.blur} min={0} max={10} step={0.5} unit="px" onChange={set('blur')} />
        <Slider label="Netteté" value={values.sharpen} min={0} max={100} unit="%" onChange={set('sharpen')} />
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Niveaux</p>
      <div className="flex flex-col gap-3">
        <Slider
          label="Point noir (entrée)"
          value={values.levels.inputMin}
          min={0}
          max={254}
          onChange={(v) => onChange({ ...values, levels: { ...values.levels, inputMin: Math.min(v, values.levels.inputMax - 1) } })}
        />
        <Slider
          label="Point blanc (entrée)"
          value={values.levels.inputMax}
          min={1}
          max={255}
          onChange={(v) => onChange({ ...values, levels: { ...values.levels, inputMax: Math.max(v, values.levels.inputMin + 1) } })}
        />
        <Slider
          label="Gamma"
          value={values.levels.gamma}
          min={0.1}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ ...values, levels: { ...values.levels, gamma: v } })}
        />
      </div>

      <p className="mb-1 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Courbes (simplifiées)
      </p>
      <div className="flex flex-col gap-3">
        <Slider
          label="Ombres"
          value={values.curve.shadows}
          min={0}
          max={255}
          onChange={(v) => onChange({ ...values, curve: { ...values.curve, shadows: v } })}
        />
        <Slider
          label="Tons moyens"
          value={values.curve.midtones}
          min={0}
          max={255}
          onChange={(v) => onChange({ ...values, curve: { ...values.curve, midtones: v } })}
        />
        <Slider
          label="Hautes lumières"
          value={values.curve.highlights}
          min={0}
          max={255}
          onChange={(v) => onChange({ ...values, curve: { ...values.curve, highlights: v } })}
        />
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Balance des couleurs</p>
      <div className="flex flex-col gap-3">
        <Slider
          label="Rouge"
          value={values.channelOffsets.r}
          min={-100}
          max={100}
          onChange={(v) => onChange({ ...values, channelOffsets: { ...values.channelOffsets, r: v } })}
        />
        <Slider
          label="Vert"
          value={values.channelOffsets.g}
          min={-100}
          max={100}
          onChange={(v) => onChange({ ...values, channelOffsets: { ...values.channelOffsets, g: v } })}
        />
        <Slider
          label="Bleu"
          value={values.channelOffsets.b}
          min={-100}
          max={100}
          onChange={(v) => onChange({ ...values, channelOffsets: { ...values.channelOffsets, b: v } })}
        />
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Mappage dégradé</p>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="color"
          value={values.gradientMap.from}
          onChange={(e) => onChange({ ...values, gradientMap: { ...values.gradientMap, from: e.target.value } })}
          className="h-8 w-full cursor-pointer rounded-md border border-stone-200 dark:border-stone-700"
        />
        <input
          type="color"
          value={values.gradientMap.to}
          onChange={(e) => onChange({ ...values, gradientMap: { ...values.gradientMap, to: e.target.value } })}
          className="h-8 w-full cursor-pointer rounded-md border border-stone-200 dark:border-stone-700"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <input
            type="checkbox"
            checked={values.gradientMap.enabled}
            onChange={(e) => onChange({ ...values, gradientMap: { ...values.gradientMap, enabled: e.target.checked } })}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          Activer
        </label>
      </div>

      <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-stone-200 bg-white pt-3 dark:border-stone-800 dark:bg-stone-900">
        <button
          onClick={onReset}
          className="flex-1 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors duration-150 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300"
        >
          Réinitialiser
        </button>
        <button
          onClick={onApply}
          className="flex-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  )
}
