import type { Wine } from './src/types/index'
import { ScheduleService } from './src/services/schedule.service'
import fs from 'fs'
import path from 'path'

if (typeof window === 'undefined') {
  (global as any).window = {}
}

// Parse CSV (simplified)
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

console.log('\n📊 ANNUAL CONSUMPTION TARGET TEST\n' + '='.repeat(60) + '\n')

// Test with 30 bottles/year
console.log('Testing with annualConsumptionTarget = 30:')
const schedule30 = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)
const byYear30: Record<number, number> = {}
schedule30.forEach(d => {
  const year = parseInt(d.scheduled_date.split('-')[0])
  byYear30[year] = (byYear30[year] || 0) + d.quantity
})
const years30 = Object.keys(byYear30).sort((a, b) => parseInt(a) - parseInt(b))
let sum30 = 0
years30.slice(0, 10).forEach(year => {
  const count = byYear30[parseInt(year)]
  sum30 += count
  console.log(`  ${year}: ${count} bottles`)
})
console.log(`  Average for first 10 years: ${(sum30 / 10).toFixed(1)} bottles/year\n`)

// Test with 45 bottles/year
console.log('Testing with annualConsumptionTarget = 45:')
const schedule45 = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 45)
const byYear45: Record<number, number> = {}
schedule45.forEach(d => {
  const year = parseInt(d.scheduled_date.split('-')[0])
  byYear45[year] = (byYear45[year] || 0) + d.quantity
})
const years45 = Object.keys(byYear45).sort((a, b) => parseInt(a) - parseInt(b))
let sum45 = 0
years45.slice(0, 10).forEach(year => {
  const count = byYear45[parseInt(year)]
  sum45 += count
  console.log(`  ${year}: ${count} bottles`)
})
console.log(`  Average for first 10 years: ${(sum45 / 10).toFixed(1)} bottles/year\n`)

console.log('='.repeat(60) + '\n')
if (sum45 > sum30) {
  console.log('✅ SUCCESS: Higher consumption target schedules more bottles per year')
} else {
  console.log('❌ FAILURE: Consumption target not affecting schedule')
}
console.log('\n')
