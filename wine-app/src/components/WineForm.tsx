import { useState } from 'react'
import type { Wine, Tier, WineType } from '../types/index'
import { TIER_LABELS } from '../types/index'
import Modal from './Modal'
import WineImagePicker from './WineImagePicker'
import { BOTTLE_FORMATS, normalizeFormat } from '../services/format.service'
import { isEstateWine } from '../services/wineName.service'
import { formatCriticRatings, parseCriticRatings } from '../services/wine.service'
import { toInt, toNumber } from '../services/numberField.service'

/** The app-wide field style, shared with the filter drawer and the
    settings form rather than redefined here. */
const INPUT = 'field'

/** A titled group of related fields. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary-container">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * A labelled field. The asterisk alone marks what is required — spelling
 * out "(optional)" on one field implies the unmarked ones are not.
 */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">
        {label}
        {required && <span className="text-primary-container"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-outline mt-1">{hint}</p>}
    </div>
  )
}

interface WineFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (wine: Omit<Wine, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  initialWine?: Wine
  isLoading?: boolean
}

export default function WineForm({ isOpen, onClose, onSubmit, initialWine, isLoading }: WineFormProps) {
  const [formData, setFormData] = useState(
    initialWine
      ? {
          // Optional Wine fields default to '' so controlled inputs and
          // selects never receive null/undefined values
          producer: initialWine.producer ?? '',
          name: initialWine.name,
          vintage: String(initialWine.vintage),
          country: initialWine.country ?? '',
          region: initialWine.region,
          classification: initialWine.classification ?? '',
          wine_type: initialWine.wine_type ?? ('Red' as WineType),
          varietal: initialWine.varietal ?? '',
          tier: String(initialWine.tier),
          location: 'storage' as 'storage' | 'home',
          quantity: String((initialWine.quantity_in_storage || 0) + (initialWine.quantity_at_home || 0)),
          // Normalised so a legacy value like "75cl" preselects its
          // trade name instead of leaving the dropdown blank
          format: normalizeFormat(initialWine.format) ?? 'Bottle',
          drinking_window_start: String(initialWine.drinking_window_start),
          drinking_window_end: String(initialWine.drinking_window_end),
          alcohol_percent: initialWine.alcohol_percent ? String(initialWine.alcohol_percent) : '',
          serving_temp_min: String(initialWine.serving_temp_min ?? 15),
          serving_temp_max: String(initialWine.serving_temp_max ?? 18),
          purchase_price: initialWine.purchase_price ? String(initialWine.purchase_price) : '',
          purchase_date: initialWine.purchase_date ?? '',
          merchant: initialWine.merchant ?? '',
          notes: initialWine.notes ?? '',
          critic_ratings: formatCriticRatings(initialWine.critic_ratings),
          flavor_profile: initialWine.flavor_profile ?? '',
          image_url: initialWine.image_url ?? '',
        }
      : {
          producer: '',
          name: '',
          vintage: String(new Date().getFullYear()),
          country: '',
          region: '',
          classification: '',
          wine_type: 'Red' as WineType,
          varietal: '',
          tier: '1',
          location: 'storage' as 'storage' | 'home',
          quantity: '1',
          format: 'Bottle',
          drinking_window_start: String(new Date().getFullYear()),
          drinking_window_end: String(new Date().getFullYear() + 10),
          alcohol_percent: '',
          serving_temp_min: '15',
          serving_temp_max: '18',
          purchase_price: '',
          purchase_date: '',
          merchant: '',
          notes: '',
          critic_ratings: '',
          flavor_profile: '',
          image_url: '',
        }
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    // Whatever was typed, verbatim. Coercing here meant an emptied field
    // refilled itself with 0 on the keystroke that cleared it, so the
    // zero could not be deleted — and "13." became "13" before the
    // decimal could be typed. Numbers are made on save, in one place.
    setFormData(prev => ({ ...prev, [name]: value }))
  }


  // A château or a Clos is its own wine; anything else needs a cuvée to
  // tell it apart from its siblings. Shared with the importer so the
  // label here matches the split it produces.
  const estateWine = isEstateWine(formData.producer, formData.region)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.producer.trim()) {
      alert('A producer is required')
      return
    }

    // Required by the form, not the data model: an estate legitimately
    // has no second line, and imported wines are allowed to lack one
    if (!estateWine && !formData.name.trim()) {
      alert('A wine name is required')
      return
    }

    // The one place text becomes numbers.
    const vintage = toInt(formData.vintage)
    const quantity = toInt(formData.quantity)
    const windowStart = toInt(formData.drinking_window_start)
    const windowEnd = toInt(formData.drinking_window_end)

    // Required numbers say so when blank rather than quietly becoming 0,
    // which would file a wine under the year zero or empty its rack.
    if (vintage === undefined || vintage < 1800) {
      alert('A vintage is required, as a 4-digit year')
      return
    }
    if (quantity === undefined || quantity < 0) {
      alert('A number of bottles is required')
      return
    }
    if (windowStart === undefined || windowEnd === undefined) {
      alert('A drinking window is required, as two years')
      return
    }
    if (windowStart > windowEnd) {
      alert('The drinking window must start before it ends')
      return
    }

    // Translate the form's single quantity + location into the split
    // inventory fields the Wine record uses. When editing, bottles at
    // home stay at home and any quantity change is applied to storage.
    // quantity and location describe the form, not the record: they
    // become quantity_in_storage / quantity_at_home below.
    const {
      location,
      quantity: _quantity,
      purchase_price,
      purchase_date,
      merchant,
      ...wineFields
    } = formData
    void _quantity
    let quantity_in_storage: number
    let quantity_at_home: number
    if (initialWine) {
      quantity_at_home = Math.min(initialWine.quantity_at_home, quantity)
      quantity_in_storage = quantity - quantity_at_home
    } else {
      quantity_in_storage = location === 'storage' ? quantity : 0
      quantity_at_home = location === 'home' ? quantity : 0
    }

    try {
      await onSubmit({
        ...wineFields,
        vintage,
        tier: (toInt(formData.tier) ?? 1) as Tier,
        drinking_window_start: windowStart,
        drinking_window_end: windowEnd,
        serving_temp_min: toInt(formData.serving_temp_min),
        serving_temp_max: toInt(formData.serving_temp_max),
        // Blank is "unrecorded", not zero: a wine with no ABV recorded
        // should not claim to be 0%.
        alcohol_percent: toNumber(formData.alcohol_percent),
        // Back to the shape the record holds, so a score typed here and
        // one imported from a CSV are stored identically
        critic_ratings: parseCriticRatings(wineFields.critic_ratings),
        purchase_price: toNumber(purchase_price),
        // Blank optional text is "unrecorded", not an empty value
        purchase_date: purchase_date.trim() || undefined,
        merchant: merchant.trim() || undefined,
        quantity_in_storage,
        quantity_at_home,
      })
      onClose()
    } catch (error) {
      alert(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialWine ? 'Edit Wine' : 'Add New Wine'} size="lg">
      {/* noValidate: validation is handled in handleSubmit; native number
          constraint checks (step) also false-negative on decimals in some
          DOM implementations */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* Fields are grouped by what they describe and ordered by how
            often they matter, rather than paired arbitrarily two to a
            row. Identity first: without it there is no wine. */}
        <Section title="Identity">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Producer" required>
              <input
                type="text"
                name="producer"
                value={formData.producer}
                onChange={handleChange}
                placeholder="e.g., Château Margaux"
                className={INPUT}
              />
            </Field>
            {/* An estate is its own wine, so the second line holds the
                appellation and is optional. Everywhere else it is the
                cuvée, and a wine without one cannot be told apart from
                its siblings. */}
            <Field label={estateWine ? 'Appellation' : 'Wine Name'} required={!estateWine}>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder={estateWine ? 'e.g., Pauillac' : "e.g., Meursault 'Boucheres'"}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vintage">
              <input type="number" name="vintage" value={formData.vintage} onChange={handleChange} className={INPUT} />
            </Field>
            <Field label="Classification">
              <input
                type="text"
                name="classification"
                value={formData.classification}
                onChange={handleChange}
                placeholder="e.g., 1er Cru, DOCG"
                className={INPUT}
              />
            </Field>
          </div>
          <Field label="Tier" hint="Drives how often the schedulers reach for this wine">
            <select name="tier" value={formData.tier} onChange={handleChange} className={INPUT}>
              {Object.entries(TIER_LABELS).map(([num, label]) => (
                <option key={num} value={num}>{label}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Origin">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country">
              <input type="text" name="country" value={formData.country} onChange={handleChange} placeholder="e.g., France" className={INPUT} />
            </Field>
            <Field label="Region">
              <input type="text" name="region" value={formData.region} onChange={handleChange} placeholder="e.g., Bordeaux" className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Wine Type">
              <select name="wine_type" value={formData.wine_type} onChange={handleChange} className={INPUT}>
                <option>Red</option>
                <option>White</option>
                <option>Rosé</option>
                <option>Sparkling</option>
                <option>Fortified</option>
              </select>
            </Field>
            <Field label="Alcohol %">
              <input type="number" name="alcohol_percent" value={formData.alcohol_percent} onChange={handleChange} step="0.1" min="0" max="20" className={INPUT} />
            </Field>
          </div>
          <Field label="Varietal" hint="Separate a blend with colons">
            <input type="text" name="varietal" value={formData.varietal} onChange={handleChange} placeholder="e.g., Cabernet Sauvignon : Merlot" className={INPUT} />
          </Field>
        </Section>

        <Section title="In the cellar">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Quantity">
              <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min="0" className={INPUT} />
            </Field>
            <Field label="Format">
              <select name="format" value={formData.format} onChange={handleChange} className={INPUT}>
                {BOTTLE_FORMATS.map(format => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </Field>
          </div>
          {/* Only meaningful when adding: an edit leaves bottles where
              they already are, so offering the choice would imply an
              effect it does not have */}
          {!initialWine && (
            <Field label="Where are they" hint="Bottles at home can be drunk tonight; storage waits for a delivery">
              <select name="location" value={formData.location} onChange={handleChange} className={INPUT}>
                <option value="storage">Storage</option>
                <option value="home">Home</option>
              </select>
            </Field>
          )}
        </Section>

        <Section title="Purchase">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price per Bottle (£)">
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price || ''}
                onChange={handleChange}
                step="0.01"
                min="0"
                placeholder="optional"
                className={INPUT}
              />
            </Field>
            <Field label="Purchase Date">
              <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className={INPUT} />
            </Field>
          </div>
          <Field label="Merchant">
            <input type="text" name="merchant" value={formData.merchant} onChange={handleChange} placeholder="e.g., Berry Bros. & Rudd" className={INPUT} />
          </Field>
        </Section>

        <Section title="Drinking & service">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Window Start Year">
              <input type="number" name="drinking_window_start" value={formData.drinking_window_start} onChange={handleChange} className={INPUT} />
            </Field>
            <Field label="Window End Year">
              <input type="number" name="drinking_window_end" value={formData.drinking_window_end} onChange={handleChange} className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Serving Temp Min (°C)">
              <input type="number" name="serving_temp_min" value={formData.serving_temp_min} onChange={handleChange} className={INPUT} />
            </Field>
            <Field label="Serving Temp Max (°C)">
              <input type="number" name="serving_temp_max" value={formData.serving_temp_max} onChange={handleChange} className={INPUT} />
            </Field>
          </div>
        </Section>

        <Section title="Tasting">
          {/* Carried in the form's state since it was written, but with
              no input to put anything in it — an imported score survived
              an edit, and a wine added by hand could never have one. */}
          <Field label="Critic Scores" hint="Separate scores with colons">
            <input
              type="text"
              name="critic_ratings"
              value={formData.critic_ratings}
              onChange={handleChange}
              placeholder="e.g., JS 97 : RP 96"
              className={INPUT}
            />
          </Field>
          <Field label="Flavour Profile" hint="Separate notes with colons">
            <input type="text" name="flavor_profile" value={formData.flavor_profile} onChange={handleChange} placeholder="e.g., Blackberry : Cassis : Graphite" className={INPUT} />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Critic notes, tasting notes..."
              className={`${INPUT} resize-none`}
            />
          </Field>
          <WineImagePicker
            imageUrl={formData.image_url}
            onImageChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
          />
        </Section>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 border border-outline-variant text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 btn-primary disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Wine'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
