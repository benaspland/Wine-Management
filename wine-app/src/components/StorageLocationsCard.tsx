import { useEffect, useState } from 'react'
import type { StorageLocation, Wine } from '../types/index'
import * as db from '../services/database'
import {
  blankLocation,
  validateLocation,
  describeLocation,
  bottlesPerLocation,
  MONTH_NAMES,
  UNALLOCATED,
  UNALLOCATED_RULES,
  type LocationDraft,
} from '../services/storageLocation.service'
import { toInt } from '../services/numberField.service'
import { Plus, Pencil, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Where the wine is kept, and what each place lets you do.
 *
 * The rules here are the reason the feature exists: a provider paid a
 * year in advance wants wine out before the renewal, a provider billed
 * by the time stored wants it left as long as possible, and a provider
 * that delivers free has no reason to make you wait for a slot. One
 * global pair of delivery months cannot express any of that.
 */

interface StorageLocationsCardProps {
  wines: Wine[]
  /** Reload the collection after a bulk assignment changes it. */
  onWinesChanged: () => Promise<void>
  onMessage: (text: string) => void
}

export default function StorageLocationsCard({
  wines,
  onWinesChanged,
  onMessage,
}: StorageLocationsCardProps) {
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [editing, setEditing] = useState<{ id?: string; draft: LocationDraft } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Tolerant of a database that is not ready: this card renders with
  // the rest of Settings, and an empty list is the correct first state
  // anyway — the collection starts with no locations configured.
  // Tolerant of a database that is not ready: this card renders with
  // the rest of Settings, and an empty list is the correct first state
  // anyway — a collection starts with no locations configured.
  const load = () =>
    db.getAllStorageLocations().then(setLocations, () => setLocations([]))

  useEffect(() => {
    load()
  }, [])

  const counts = bottlesPerLocation(wines)
  const unallocated = counts.get(UNALLOCATED) ?? 0

  const save = async () => {
    if (!editing) return
    const problem = validateLocation(editing.draft)
    if (problem) {
      onMessage(problem)
      return
    }
    setBusy(true)
    try {
      const draft = { ...editing.draft, name: editing.draft.name.trim() }
      if (editing.id) await db.updateStorageLocation(editing.id, draft)
      else await db.createStorageLocation(draft)
      await load()
      setEditing(null)
    } catch (error) {
      onMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await db.deleteStorageLocation(id)
      await load()
      await onWinesChanged()
      setConfirmingDelete(null)
    } catch (error) {
      onMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const assignUnallocated = async (id: string) => {
    setBusy(true)
    try {
      const moved = await db.assignUnallocatedWines(id)
      await onWinesChanged()
      onMessage(`${moved} ${moved === 1 ? 'wine' : 'wines'} moved to this location`)
    } catch (error) {
      onMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = 'field'

  return (
    <div className="card">
      <h3 className="font-headline text-xl font-bold mb-2">Storage Locations</h3>
      <p className="text-sm text-outline mb-4">
        Where your wine is kept before it comes home. Each place has its own
        delivery rules, because a provider paid a year ahead wants wine out
        before the renewal and one billed by the month does not.
      </p>

      <div className="space-y-3">
        {locations.map(location =>
          editing?.id === location.id ? (
            <LocationForm
              key={location.id}
              draft={editing.draft}
              onChange={draft => setEditing({ id: location.id, draft })}
              onSave={save}
              onCancel={() => setEditing(null)}
              busy={busy}
              fieldClass={field}
            />
          ) : (
            <div key={location.id} className="panel panel-sunken p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{location.name}</p>
                  <p className="text-xs text-outline mt-0.5">{describeLocation(location)}</p>
                  <p className="text-xs text-outline-variant mt-0.5">
                    {counts.get(location.id) ?? 0} bottles here
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() =>
                      setEditing({
                        id: location.id,
                        draft: {
                          name: location.name,
                          cadence: location.cadence,
                          delivery_months: [...location.delivery_months],
                          min_bottles: location.min_bottles,
                          renewal_month: location.renewal_month,
                        },
                      })
                    }
                    aria-label={`Edit ${location.name}`}
                    className="h-9 w-9 flex items-center justify-center rounded-full border border-outline-variant text-outline-variant hover:text-on-surface transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(location.id)}
                    aria-label={`Delete ${location.name}`}
                    className="h-9 w-9 flex items-center justify-center rounded-full border border-outline-variant text-outline-variant hover:text-error transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {confirmingDelete === location.id && (
                <div className="mt-3 text-xs space-y-2">
                  {/* The wines are not deleted with the locker — they go
                      back to unallocated, which the app is built to
                      tolerate. Said out loud so the button is not scary
                      in a way it does not deserve. */}
                  <p className="text-warning flex items-start gap-1.5">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Its {counts.get(location.id) ?? 0} bottles go back to unallocated. No
                      wine is deleted.
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      className="flex-1 border border-outline-variant text-outline-variant py-2 rounded-full text-xs uppercase tracking-widest font-bold"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => remove(location.id)}
                      disabled={busy}
                      className="flex-1 border border-error text-error py-2 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {unallocated > 0 && (
                <button
                  onClick={() => assignUnallocated(location.id)}
                  disabled={busy}
                  className="mt-3 w-full rounded-full border border-primary-container/60 py-2 text-xs font-bold uppercase tracking-widest text-primary-container disabled:opacity-50 transition-colors"
                >
                  Move all unallocated here
                </button>
              )}
            </div>
          )
        )}

        {/* Unallocated is not a location you can configure — it is the
            absence of one. Shown anyway, because a collection with
            bottles sitting in it is the thing most worth noticing. */}
        <div className="panel panel-sunken p-3 opacity-80">
          <p className="text-sm font-semibold text-outline">{UNALLOCATED_RULES.name}</p>
          <p className="text-xs text-outline-variant mt-0.5">
            {describeLocation({ ...UNALLOCATED_RULES, created_at: '', updated_at: '' })} ·{' '}
            {unallocated} bottles
          </p>
          {unallocated > 0 && locations.length === 0 && (
            <p className="text-xs text-outline mt-2">
              Add the place most of your wine is kept, then move them all there
              in one go and correct the exceptions.
            </p>
          )}
        </div>

        {editing && !editing.id && (
          <LocationForm
            draft={editing.draft}
            onChange={draft => setEditing({ draft })}
            onSave={save}
            onCancel={() => setEditing(null)}
            busy={busy}
            fieldClass={field}
          />
        )}

        {!editing && (
          <button
            onClick={() => setEditing({ draft: blankLocation() })}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-outline-variant py-2.5 text-xs font-bold uppercase tracking-widest text-outline-variant hover:text-on-surface transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            Add a location
          </button>
        )}
      </div>
    </div>
  )
}

function LocationForm({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  fieldClass,
}: {
  draft: LocationDraft
  onChange: (draft: LocationDraft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  fieldClass: string
}) {
  const toggleMonth = (month: number) => {
    const months = draft.delivery_months.includes(month)
      ? draft.delivery_months.filter(m => m !== month)
      : [...draft.delivery_months, month].sort((a, b) => a - b)
    onChange({ ...draft, delivery_months: months })
  }

  return (
    <div className="panel panel-sunken p-3 space-y-3">
      <div>
        <label className="block text-xs text-outline mb-1 uppercase tracking-wider">Name</label>
        <input
          type="text"
          value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Nexus"
          className={fieldClass}
        />
      </div>

      <div>
        <label className="block text-xs text-outline mb-1 uppercase tracking-wider">
          Delivers
        </label>
        <select
          value={draft.cadence}
          onChange={e =>
            onChange({ ...draft, cadence: e.target.value as LocationDraft['cadence'] })
          }
          className={fieldClass}
        >
          <option value="fixed">On set months</option>
          <option value="flexible">Any month — delivery is free</option>
        </select>
      </div>

      {draft.cadence === 'fixed' && (
        <div>
          <label className="block text-xs text-outline mb-1 uppercase tracking-wider">
            Delivery months
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES.map((name, index) => {
              const month = index + 1
              const on = draft.delivery_months.includes(month)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleMonth(month)}
                  aria-pressed={on}
                  className={`rounded-[8px] border py-1.5 text-xs transition-colors ${
                    on
                      ? 'border-primary-container bg-primary-container/15 text-primary-container'
                      : 'border-outline-variant text-outline'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-outline mb-1 uppercase tracking-wider">
          Smallest delivery worth taking
        </label>
        <input
          type="number"
          value={draft.min_bottles}
          onChange={e => onChange({ ...draft, min_bottles: toInt(e.target.value) ?? 0 })}
          className={fieldClass}
        />
        <p className="text-xs text-outline mt-1">
          In bottles. Two standard cases is 12; the old single rule was 24.
        </p>
      </div>

      <div>
        <label className="block text-xs text-outline mb-1 uppercase tracking-wider">
          Storage paid a year ahead, renewing
        </label>
        <select
          value={draft.renewal_month ?? ''}
          onChange={e =>
            onChange({
              ...draft,
              renewal_month: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={fieldClass}
        >
          <option value="">Not prepaid — billed for the time stored</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <p className="text-xs text-outline mt-1">
          Deliveries in the months before this are preferred, so fewer bottles
          are still here when the next year is charged for.
        </p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 border border-outline-variant text-outline-variant py-2.5 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-50"
        >
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={busy} className="flex-1 btn-primary disabled:opacity-50">
          Save
        </button>
      </div>
    </div>
  )
}
