import { useState } from 'react'
import type { Wine, Tier, WineType } from '../types/index'
import { TIER_LABELS } from '../types/index'
import Modal from './Modal'
import WineImagePicker from './WineImagePicker'

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
          vintage: initialWine.vintage,
          country: initialWine.country ?? '',
          region: initialWine.region,
          classification: initialWine.classification ?? '',
          wine_type: initialWine.wine_type ?? ('Red' as WineType),
          varietal: initialWine.varietal ?? '',
          tier: initialWine.tier,
          location: 'storage' as 'storage' | 'home',
          quantity: (initialWine.quantity_in_storage || 0) + (initialWine.quantity_at_home || 0),
          format: initialWine.format ?? '750ml',
          drinking_window_start: initialWine.drinking_window_start,
          drinking_window_end: initialWine.drinking_window_end,
          alcohol_percent: initialWine.alcohol_percent ?? 0,
          serving_temp_min: initialWine.serving_temp_min ?? 15,
          serving_temp_max: initialWine.serving_temp_max ?? 18,
          purchase_price: initialWine.purchase_price ?? 0,
          notes: initialWine.notes ?? '',
          critic_ratings: initialWine.critic_ratings ?? {},
          flavor_profile: initialWine.flavor_profile ?? '',
          image_url: initialWine.image_url ?? '',
        }
      : {
          producer: '',
          name: '',
          vintage: new Date().getFullYear(),
          country: '',
          region: '',
          classification: '',
          wine_type: 'Red' as WineType,
          varietal: '',
          tier: 1 as Tier,
          location: 'storage' as 'storage' | 'home',
          quantity: 1,
          format: '750ml',
          drinking_window_start: new Date().getFullYear(),
          drinking_window_end: new Date().getFullYear() + 10,
          alcohol_percent: 0,
          serving_temp_min: 15,
          serving_temp_max: 18,
          purchase_price: 0,
          notes: '',
          critic_ratings: {},
          flavor_profile: '',
          image_url: '',
        }
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    const intFields = ['vintage', 'quantity', 'drinking_window_start', 'drinking_window_end', 'serving_temp_min', 'serving_temp_max']

    let parsed: string | number = value
    if (name === 'alcohol_percent' || name === 'purchase_price') {
      parsed = value ? parseFloat(value) : 0
    } else if (intFields.includes(name)) {
      parsed = value ? parseInt(value) : 0
    }

    setFormData(prev => ({ ...prev, [name]: parsed }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.producer.trim() || !formData.name.trim()) {
      alert('Producer and wine name are required')
      return
    }

    // Translate the form's single quantity + location into the split
    // inventory fields the Wine record uses. When editing, bottles at
    // home stay at home and any quantity change is applied to storage.
    const { location, quantity, purchase_price, ...wineFields } = formData
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
        purchase_price: purchase_price > 0 ? purchase_price : undefined,
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
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Producer & Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Producer *</label>
            <input
              type="text"
              name="producer"
              value={formData.producer}
              onChange={handleChange}
              placeholder="e.g., Château Margaux"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Wine Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Margaux"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Location & Vintage */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Location</label>
            <select
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            >
              <option value="home">Home</option>
              <option value="storage">Storage</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Vintage</label>
            <input
              type="number"
              name="vintage"
              value={formData.vintage}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Country & Region */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Country</label>
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              placeholder="e.g., France"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Region</label>
            <input
              type="text"
              name="region"
              value={formData.region}
              onChange={handleChange}
              placeholder="e.g., Bordeaux"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Wine Type & Tier */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Wine Type</label>
            <select
              name="wine_type"
              value={formData.wine_type}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            >
              <option>Red</option>
              <option>White</option>
              <option>Rosé</option>
              <option>Sparkling</option>
              <option>Fortified</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Tier</label>
            <select
              name="tier"
              value={formData.tier}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            >
              {Object.entries(TIER_LABELS).map(([num, label]) => (
                <option key={num} value={num}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quantity & Format */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Quantity</label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="0"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Format</label>
            <select
              name="format"
              value={formData.format}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            >
              <option>375ml</option>
              <option>750ml</option>
              <option>1.5L</option>
              <option>3L</option>
            </select>
          </div>
        </div>

        {/* Purchase Price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Price per Bottle (£)</label>
            <input
              type="number"
              name="purchase_price"
              value={formData.purchase_price || ''}
              onChange={handleChange}
              step="0.01"
              min="0"
              placeholder="optional"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Drinking Window */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Window Start Year</label>
            <input
              type="number"
              name="drinking_window_start"
              value={formData.drinking_window_start}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Window End Year</label>
            <input
              type="number"
              name="drinking_window_end"
              value={formData.drinking_window_end}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Serving Temperature */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Serving Temp Min (°C)</label>
            <input
              type="number"
              name="serving_temp_min"
              value={formData.serving_temp_min}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Serving Temp Max (°C)</label>
            <input
              type="number"
              name="serving_temp_max"
              value={formData.serving_temp_max}
              onChange={handleChange}
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Alcohol & Varietal */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Alcohol %</label>
            <input
              type="number"
              name="alcohol_percent"
              value={formData.alcohol_percent}
              onChange={handleChange}
              step="0.1"
              min="0"
              max="20"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Classification</label>
            <input
              type="text"
              name="classification"
              value={formData.classification}
              onChange={handleChange}
              placeholder="e.g., Reserva, DOCG"
              className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Critic notes, tasting notes..."
            className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Varietal */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Varietal (colon-separated)</label>
          <input
            type="text"
            name="varietal"
            value={formData.varietal}
            onChange={handleChange}
            placeholder="e.g., Cabernet Sauvignon : Merlot"
            className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Flavor Profile */}
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Flavor Profile (colon-separated)</label>
          <input
            type="text"
            name="flavor_profile"
            value={formData.flavor_profile}
            onChange={handleChange}
            placeholder="e.g., Blackberry : Cassis : Graphite"
            className="w-full bg-surface-container-low text-on-surface px-3 py-2 rounded-lg border border-outline-variant/20 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Image */}
        <WineImagePicker
          imageUrl={formData.image_url}
          onImageChange={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
          producer={formData.producer}
          wineName={formData.name}
          vintage={formData.vintage}
        />

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 border border-outline-variant/30 text-outline-variant hover:text-outline py-3 text-xs tracking-widest uppercase font-bold rounded-full disabled:opacity-50 transition-colors"
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
