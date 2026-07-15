import type { Wine } from './src/types/index'
import { ScheduleService } from './src/services/schedule.service'
import fs from 'fs'
import path from 'path'

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
    if (char === '"') inQuotes = !inQuotes
    else if (char === ',' && !inQuotes) {
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
  if (!isNaN(rating)) tier = Math.max(1, Math.min(5, rating))

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

console.log('\n📊 TIER 4-5 PRIORITY COMPARISON TEST\n' + '='.repeat(80) + '\n')

// Current schedule
console.log('CURRENT SCHEDULE (no Tier 4-5 boost):')
console.log('-'.repeat(80))
const currentSchedule = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)

// Analyze when Tier 4-5 wines are delivered
const tier45Current: Record<number, number> = {}
const allDeliveriesCurrentByYear: Record<number, number> = {}
currentSchedule.forEach(d => {
  const year = parseInt(d.scheduled_date.split('-')[0])
  const wine = wines.find(w => w.id === d.wine_id)
  allDeliveriesCurrentByYear[year] = (allDeliveriesCurrentByYear[year] || 0) + d.quantity
  if (wine && wine.tier >= 4) {
    tier45Current[year] = (tier45Current[year] || 0) + d.quantity
  }
})

const yearsSorted = Object.keys(allDeliveriesCurrentByYear).sort((a, b) => parseInt(a) - parseInt(b))
console.log('\nTier 4-5 wine deliveries by year:')
yearsSorted.forEach(year => {
  const tier45 = tier45Current[parseInt(year)] || 0
  const total = allDeliveriesCurrentByYear[parseInt(year)]
  const pct = total > 0 ? ((tier45 / total) * 100).toFixed(0) : '0'
  if (tier45 > 0) {
    console.log(`  ${year}: ${tier45} bottles (${pct}% of ${total} total)`)
  }
})

// Count total by tier
let tier45TotalCurrent = 0
Object.values(tier45Current).forEach(v => tier45TotalCurrent += v)
const earliestTier45Year = Object.keys(tier45Current).length > 0 ?
  Math.min(...Object.keys(tier45Current).map(y => parseInt(y))) : 'Never'
const tier45Year2029Plus = Object.entries(tier45Current)
  .filter(([y]) => parseInt(y) >= 2029)
  .reduce((sum, [, v]) => sum + v, 0)

console.log(`\nSummary:`)
console.log(`  Total Tier 4-5 bottles: ${tier45TotalCurrent}`)
console.log(`  Earliest delivery year: ${earliestTier45Year}`)
console.log(`  Delivered 2029+: ${tier45Year2029Plus}`)
console.log(`  Delivered before 2029: ${tier45TotalCurrent - tier45Year2029Plus}`)

// Show first 15 Tier 4-5 wines and when they're delivered
console.log(`\nFirst Tier 4-5 wines scheduled:`)
const tier45Wines = currentSchedule
  .filter(d => wines.find(w => w.id === d.wine_id && w.tier >= 4))
  .slice(0, 15)
  .map(d => ({
    wine: wines.find(w => w.id === d.wine_id)!,
    delivery: d
  }))

tier45Wines.forEach(({ wine, delivery }) => {
  const year = parseInt(delivery.scheduled_date.split('-')[0])
  const yearsUntilDrinkable = Math.max(0, wine.drinking_window_start - 2026)
  console.log(`  ${wine.name.substring(0, 40)} (${wine.vintage}): Delivered ${year}, Drinkable ${wine.drinking_window_start} (${yearsUntilDrinkable} years away in 2026)`)
})

console.log('\n' + '='.repeat(80) + '\n')

console.log('ANALYSIS:')
console.log(`- Tier 4-5 wines start being scheduled in year ${earliestTier45Year}`)
console.log(`- ${tier45Year2029Plus} bottles (${((tier45Year2029Plus/tier45TotalCurrent)*100).toFixed(0)}%) scheduled in 2029+`)
console.log(`- ${tier45TotalCurrent - tier45Year2029Plus} bottles scheduled before 2029`)

if (earliestTier45Year === 2029 || earliestTier45Year === '2030') {
  console.log('\n⚠️  Tier 4-5 wines are being held back - they only start in 2029+')
  console.log('    A priority boost for wines approaching drinkability could pull them forward.')
} else {
  console.log(`\n✓ Tier 4-5 wines are being scheduled earlier (starting ${earliestTier45Year})`)
}

console.log('\n' + '='.repeat(80) + '\n')
