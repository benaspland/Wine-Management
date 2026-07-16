import type { Wine } from '../types/index'
import { House, Warehouse } from 'lucide-react'

/**
 * Shows where a wine's bottles physically are — the core inventory
 * state (home vs professional storage) made visible at a glance.
 * The home count is highlighted when > 0: that's the "can I drink
 * this tonight?" signal.
 */
export default function LocationBadge({ wine }: { wine: Wine }) {
  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      <span
        className={`flex items-center gap-1 ${
          wine.quantity_at_home > 0 ? 'text-primary' : 'text-outline opacity-60'
        }`}
        title={`${wine.quantity_at_home} at home`}
      >
        <House size={14} aria-hidden="true" />
        {wine.quantity_at_home}
      </span>
      <span
        className={`flex items-center gap-1 ${
          wine.quantity_in_storage > 0 ? 'text-on-surface/80' : 'text-outline opacity-60'
        }`}
        title={`${wine.quantity_in_storage} in storage`}
      >
        <Warehouse size={14} aria-hidden="true" />
        {wine.quantity_in_storage}
      </span>
    </div>
  )
}
