import fs from 'fs'
import path from 'path'
import type { Wine } from './src/types/index'
import { ScheduleService } from './src/services/schedule.service'

// Mock window
if (typeof window === 'undefined') {
  (global as any).window = {}
}

// Parse CSV
const csvPath = path.join(__dirname, '../wine-data.csv')
const csvContent = fs.readFileSync(csvPath, 'utf-8')
const lines = csvContent.trim().split('\n')
const headers = lines[0].split(',').map(h => h.trim())
const rows = lines.slice(1).map(line => {
  const values = []
  let currentValue = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim().replace(/^"|"$/g, ''))
      currentValue = ''
    } else {
      currentValue += char
    }
  }
  values.push(currentValue.trim().replace(/^"|"$/g, ''))
  return values
})

const wines: Wine[] = rows.map((row, idx) => {
  const obj: Record<string, string> = {}
  headers.forEach((header, i) => {
    obj[header.trim()] = row[i]
  })

  const vintage = parseInt(obj.Vintage)
  const quantity = parseInt(obj.Quantity)
  const format = obj.Size || '750ml'

  let dwStart = 2020, dwEnd = 2050
  if (obj['Peak Drinking Window']) {
    const [start, end] = obj['Peak Drinking Window'].split('-').map(x => parseInt(x.trim()))
    if (!isNaN(start)) dwStart = start
    if (!isNaN(end)) dwEnd = end
  }

  let tier = 3
  const rating = parseInt(obj['Wine Rating'])
  if (!isNaN(rating)) {
    tier = Math.max(1, Math.min(5, rating))
  }

  return {
    id: `wine-${idx + 1}`,
    producer: obj.Wine?.split(' ').slice(0, 3).join(' ') || 'Unknown',
    name: obj.Wine || 'Unknown',
    vintage,
    country: obj.Country || '',
    region: obj.Region || '',
    classification: obj.Classification || '',
    wine_type: 'Red' as const,
    varietal: obj.Varietal || '',
    tier,
    location: 'storage' as const,
    quantity,
    format,
    drinking_window_start: dwStart,
    drinking_window_end: dwEnd,
    alcohol_percent: 0,
    serving_temp_min: 16,
    serving_temp_max: 18,
    notes: '',
    critic_ratings: {},
    flavor_profile: ''
  } as Wine
})

const schedule = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9])
const scheduledIds = new Set(schedule.map(d => d.wine_id))

console.log('\n📋 DETAILED ANALYSIS OF UNSCHEDULED WINES\n' + '='.repeat(80) + '\n')

const unscheduled = wines.filter(w => !scheduledIds.has(w.id))

// Categorize unscheduled wines
const byReason: Record<string, Wine[]> = {
  'Tier 4-5 too young': [],
  'Single magnum (Tier 4-5 young)': [],
  'Other': []
}

unscheduled.forEach(w => {
  if (w.tier >= 4 && w.vintage < 2029) {
    if (w.format?.toLowerCase().includes('magnum') && w.quantity === 1) {
      byReason['Single magnum (Tier 4-5 young)'].push(w)
    } else {
      byReason['Tier 4-5 too young'].push(w)
    }
  } else {
    byReason['Other'].push(w)
  }
})

Object.entries(byReason).forEach(([reason, wines_in_category]) => {
  if (wines_in_category.length === 0) return

  console.log(`\n${reason} (${wines_in_category.length} wines, ${wines_in_category.reduce((s, w) => s + w.quantity, 0)} bottles):`)
  console.log('-'.repeat(80))

  wines_in_category.forEach(w => {
    const reason_detail =
      w.tier >= 4 && w.vintage < 2029 ?
        `Tier ${w.tier} vintage ${w.vintage} (can't deliver before 2029)` :
      w.drinking_window_end < 2046 ?
        `Window closes ${w.drinking_window_end}` :
      'Format/quantity constraints'

    console.log(`  ${w.name} (${w.vintage})`)
    console.log(`    Quantity: ${w.quantity}, Format: ${w.format}, Tier: ${w.tier}`)
    console.log(`    Window: ${w.drinking_window_start}-${w.drinking_window_end}`)
    console.log(`    Reason: ${reason_detail}`)
    console.log('')
  })
})

const totalUnscheduled = unscheduled.reduce((s, w) => s + w.quantity, 0)
console.log(`\nSUMMARY: ${unscheduled.length} unscheduled wines, ${totalUnscheduled} total bottles\n` + '='.repeat(80) + '\n')
