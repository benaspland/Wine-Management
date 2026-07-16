import fs from 'fs'
import path from 'path'
import type { Wine } from './src/types/index'
import { ScheduleService } from './src/services/schedule.service'

// Mock window object for browser-only code
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

// Map CSV to Wine objects
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

  let criticRatings: Record<string, number> = {}
  if (obj['Professional Critic Ratings']) {
    const ratings = obj['Professional Critic Ratings'].split(':')
    ratings.forEach(r => {
      const [name, score] = r.trim().split(/\s+/)
      if (name && score) {
        criticRatings[name.toLowerCase()] = parseInt(score)
      }
    })
  }

  let alcohol = 0
  if (obj['Alcohol Level']) {
    alcohol = parseFloat(obj['Alcohol Level'].replace('%', ''))
  }

  let servingTempMin = 16, servingTempMax = 18
  if (obj['Recommended Service Temp']) {
    const [min, max] = obj['Recommended Service Temp'].split('-').map(x => parseInt(x.replace('°C', '').trim()))
    if (!isNaN(min)) servingTempMin = min
    if (!isNaN(max)) servingTempMax = max
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
    alcohol_percent: alcohol,
    serving_temp_min: servingTempMin,
    serving_temp_max: servingTempMax,
    notes: obj['Wine Notes'] || '',
    critic_ratings: criticRatings,
    flavor_profile: obj['Flavour Profile'] || '',
    image_url: undefined
  } as Wine
})

console.log(`\n📊 DELIVERY SCHEDULE TEST REPORT - ACTUAL SERVICE\n${'='.repeat(60)}\n`)
console.log(`Total wines in CSV: ${wines.length}`)
const totalBottles = wines.reduce((sum, w) => sum + w.quantity, 0)
console.log(`Total bottles in storage: ${totalBottles}\n`)

console.log('🔄 Generating delivery schedule with actual TypeScript service...\n')
const schedule = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9])

// Analyze results
const scheduledBottles = schedule.reduce((sum, d) => sum + d.quantity, 0)
const bottlesByYear: Record<number, number> = {}
const bottlesByCategory: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

schedule.forEach(delivery => {
  const year = parseInt(delivery.scheduled_date.split('-')[0])
  bottlesByYear[year] = (bottlesByYear[year] || 0) + delivery.quantity

  const wine = wines.find(w => w.id === delivery.wine_id)
  if (wine) {
    bottlesByCategory[wine.tier] = (bottlesByCategory[wine.tier] || 0) + delivery.quantity
  }
})

const scheduledWineIds = new Set(schedule.map(d => d.wine_id))
const unscheduledBottles = wines
  .filter(w => !scheduledWineIds.has(w.id))
  .reduce((sum, w) => sum + w.quantity, 0)

console.log(`✅ DELIVERY SCHEDULE RESULTS:`)
console.log(`${'─'.repeat(60)}`)
console.log(`Total bottles scheduled: ${scheduledBottles}/${totalBottles}`)
console.log(`Coverage: ${((scheduledBottles / totalBottles) * 100).toFixed(1)}%`)
console.log(`Unscheduled bottles: ${unscheduledBottles}\n`)

console.log(`📅 DELIVERIES BY YEAR:`)
console.log(`${'─'.repeat(60)}`)
const yearsSorted = Object.keys(bottlesByYear).sort((a, b) => parseInt(a) - parseInt(b))
yearsSorted.forEach(year => {
  const count = bottlesByYear[parseInt(year)]
  const bars = '█'.repeat(Math.ceil(count / 10))
  console.log(`${year}: ${bars} ${count} bottles`)
})

console.log(`\n🏆 DELIVERIES BY CATEGORY (TIER):`)
console.log(`${'─'.repeat(60)}`)
const tiers = ['EVERYDAY', 'QUALITY', 'FINE', 'PREMIUM', 'ICON']
Object.entries(bottlesByCategory).forEach(([tier, count]) => {
  const tierName = tiers[parseInt(tier) - 1]
  const bars = '█'.repeat(Math.ceil(count / 10))
  console.log(`Tier ${tier} (${tierName}): ${bars} ${count} bottles`)
})

console.log(`\n📊 DELIVERY STATISTICS:`)
console.log(`${'─'.repeat(60)}`)
console.log(`Total deliveries: ${schedule.length}`)
console.log(`Average bottles per delivery: ${(scheduledBottles / schedule.length).toFixed(1)}`)
console.log(`Years covered: ${yearsSorted.length}`)

if (unscheduledBottles > 0) {
  console.log(`\n⚠️  UNSCHEDULED WINES (first 15):`)
  console.log(`${'─'.repeat(60)}`)
  wines
    .filter(w => !scheduledWineIds.has(w.id))
    .slice(0, 15)
    .forEach(w => {
      console.log(`- ${w.name} (${w.vintage}): ${w.quantity} bottles, Tier ${w.tier}, Format: ${w.format}`)
    })
  const totalUnscheduled = wines.filter(w => !scheduledWineIds.has(w.id)).length
  if (totalUnscheduled > 15) {
    console.log(`... and ${totalUnscheduled - 15} more`)
  }
}

console.log(`\n✨ Test complete.\n`)

if (scheduledBottles === totalBottles) {
  console.log(`🎉 SUCCESS: All ${totalBottles} bottles are scheduled!`)
} else {
  console.log(`❌ RESULT: ${scheduledBottles}/${totalBottles} bottles scheduled (${unscheduledBottles} remain)`)
}

console.log(`\n${'='.repeat(60)}\n`)
