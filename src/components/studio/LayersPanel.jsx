import { Copy, Eye, EyeOff, Image as ImageIcon, Plus, Trash2, Blend as MaskIcon, ChevronDown, ChevronUp } from 'lucide-react'
import { BLEND_MODES } from '../../utils/canvasEngine'

/**
 * Panneau "Calques & Fusion" — purement présentationnel : liste les calques
 * du document (du premier plan en haut, comme Photoshop) avec leurs
 * contrôles (visibilité, opacité, mode de fusion, masque, réordonnancement,
 * duplication, suppression). Toute la mutation des calques vit chez
 * l'appelant (ImageLayersPage.jsx) — ce composant ne fait que l'afficher.
 */
export default function LayersPanel({
  layers,
  activeLayerId,
  onSelect,
  onAddBlank,
  onAddFromFile,
  onDuplicate,
  onDelete,
  onToggleVisible,
  onOpacityChange,
  onBlendModeChange,
  onMoveUp,
  onMoveDown,
  onToggleMask,
  onRename,
}) {
  // Affichage du dernier calque (dessus) en premier dans la liste.
  const reversed = [...layers].reverse()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Calques</p>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddBlank}
            title="Nouveau calque vide"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Plus size={15} />
          </button>
          <label
            title="Ajouter une image comme calque"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ImageIcon size={15} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) onAddFromFile(e.target.files[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {reversed.map((layer, i) => {
          const isTop = i === 0
          const isBottom = i === reversed.length - 1
          const active = layer.id === activeLayerId
          return (
            <div
              key={layer.id}
              onClick={() => onSelect(layer.id)}
              className={`cursor-pointer border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800/60 ${
                active ? 'bg-indigo-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisible(layer.id)
                  }}
                  className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                <input
                  value={layer.name}
                  onChange={(e) => onRename(layer.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`min-w-0 flex-1 truncate bg-transparent text-sm font-medium focus:outline-none ${
                    active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-200'
                  }`}
                />

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleMask(layer.id)
                  }}
                  title="Masque de fusion"
                  className={`shrink-0 rounded p-1 ${layer.maskCanvas ? 'text-indigo-500' : 'text-zinc-300 dark:text-zinc-600'} hover:text-indigo-500`}
                >
                  <MaskIcon size={13} />
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveUp(layer.id)
                    }}
                    disabled={isTop}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-20 dark:hover:text-zinc-200"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveDown(layer.id)
                    }}
                    disabled={isBottom}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-20 dark:hover:text-zinc-200"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDuplicate(layer.id)
                    }}
                    className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(layer.id)
                    }}
                    className="rounded p-1 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={layer.blendMode}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onBlendModeChange(layer.id, e.target.value)}
                  className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {BLEND_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(layer.opacity * 100)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onOpacityChange(layer.id, Number(e.target.value) / 100)}
                  className="w-full accent-indigo-500"
                />
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-zinc-400">
                  {Math.round(layer.opacity * 100)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
