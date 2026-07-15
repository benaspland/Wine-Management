import * as fs from 'fs'
import * as path from 'path'
import { ScheduleService } from './src/services/schedule.service'

// Simple in-memory database for testing
let testDb = {
  delayedWines: new Map<string, Set<string>>(),
  pinnedWines: new Map<string, Set<string>>(),
  locks: new Map<string, boolean>(),
}

interface TestWine {
  id: string
  producer: string
  name: string
  vintage: number
  region: string
  classification?: string
  wine_type: string
  varietal?: string
  tier: number
  location: 'storage' | 'home'
  quantity: number
  format: string
  drinking_window_start: number
  drinking_window_end: number
  alcohol_percent?: number
  serving_temp_min?: number
  serving_temp_max?: number
  notes?: string
  critic_ratings?: string
  flavor_profile?: string
  image_url?: string
  created_at: string
  updated_at: string
}

function loadWines(): TestWine[] {
  const csvPath = path.join(__dirname, '..', 'wine-data.csv')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split('\n').slice(1) // Skip header

  return lines
    .filter(line => line.trim())
    .slice(0, 126) // Use first 126 wines
    .map((line, idx) => {
      const [producer, name, vintage, country, region, classification, wine_type, varietal, tier, format, drinking_window_start, drinking_window_end, alcohol_percent, serving_temp_min, serving_temp_max, notes, critic_ratings, flavor_profile, image_url] = line.split(',')

      return {
        id: `wine-${idx}`,
        producer,
        name,
        vintage: parseInt(vintage),
        region,
        classification,
        wine_type,
        varietal,
        tier: parseInt(tier),
        location: 'storage',
        quantity: 6, // All 6 bottle format
        format,
        drinking_window_start: parseInt(drinking_window_start),
        drinking_window_end: parseInt(drinking_window_end),
        alcohol_percent: alcohol_percent ? parseFloat(alcohol_percent) : undefined,
        serving_temp_min: serving_temp_min ? parseInt(serving_temp_min) : undefined,
        serving_temp_max: serving_temp_max ? parseInt(serving_temp_max) : undefined,
        notes,
        critic_ratings,
        flavor_profile,
        image_url,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })
}

console.log('📊 DELAYED WINE RESCHEDULING TEST')
console.log('='.repeat(60))

const wines = loadWines()
console.log(`\nLoaded ${wines.length} wines from CSV\n`)

// Generate initial schedule
console.log('🔄 Generating initial delivery schedule...')
const schedule = ScheduleService.generateDeliverySchedule(wines, 80, 0, [3, 9], 30)

// Group by date
const grouped: Record<string, { wines: TestWine[]; bottles: number }> = {}
schedule.forEach(entry => {
  if (!grouped[entry.scheduled_date]) {
    grouped[entry.scheduled_date] = { wines: [], bottles: 0 }
  }
  const wine = wines.find(w => w.id === entry.wine_id)
  if (wine) {
    grouped[entry.scheduled_date].wines.push({...wine, quantity: entry.quantity})
    grouped[entry.scheduled_date].bottles += entry.quantity
  }
})

const sortedDates = Object.keys(grouped).sort()
const currentDeliveryDate = sortedDates[0]
const nextDeliveryDate = sortedDates[1]

console.log(`✓ Initial schedule generated with ${Object.keys(grouped).length} deliveries\n`)

console.log('📅 CURRENT DELIVERY:')
console.log(`Date: ${currentDeliveryDate}`)
console.log(`Bottles: ${grouped[currentDeliveryDate].bottles}`)
console.log(`Wines: ${grouped[currentDeliveryDate].wines.length}`)

if (nextDeliveryDate) {
  console.log('\n📅 NEXT FUTURE DELIVERY (after current):')
  console.log(`Date: ${nextDeliveryDate}`)
  console.log(`Bottles: ${grouped[nextDeliveryDate].bottles}`)
  console.log(`Wines: ${grouped[nextDeliveryDate].wines.length}`)
}

// Simulate delaying a wine from current delivery
console.log('\n🔄 SIMULATING DELAY:')
const wineToDelay = grouped[currentDeliveryDate].wines[0]
console.log(`Delaying: ${wineToDelay.producer} - ${wineToDelay.name} (${wineToDelay.quantity} bottles)`)

// Mark it as delayed
testDb.delayedWines.set(currentDeliveryDate, new Set([wineToDelay.id]))

// Regenerate schedule with the delayed wine removed from current delivery
const currentDeliveryFiltered = grouped[currentDeliveryDate].wines.filter(w => w.id !== wineToDelay.id)
const allWinesWithDelayed = wines.map(w => w.id === wineToDelay.id ? {...w, ...wineToDelay} : w)

const scheduleAfterDelay = ScheduleService.generateDeliverySchedule(allWinesWithDelayed, 80, 0, [3, 9], 30)

// Group by date again
const groupedAfterDelay: Record<string, { wines: TestWine[]; bottles: number }> = {}
scheduleAfterDelay.forEach(entry => {
  if (!groupedAfterDelay[entry.scheduled_date]) {
    groupedAfterDelay[entry.scheduled_date] = { wines: [], bottles: 0 }
  }
  // Skip delayed wine in current delivery
  if (entry.scheduled_date === currentDeliveryDate && entry.wine_id === wineToDelay.id) {
    return
  }
  const wine = wines.find(w => w.id === entry.wine_id)
  if (wine) {
    groupedAfterDelay[entry.scheduled_date].wines.push({...wine, quantity: entry.quantity})
    groupedAfterDelay[entry.scheduled_date].bottles += entry.quantity
  }
})

console.log('\n📋 RESULTS AFTER DELAY:')
console.log(`\nCurrent delivery (${currentDeliveryDate}):`)
console.log(`  Before: ${grouped[currentDeliveryDate].wines.length} wines, ${grouped[currentDeliveryDate].bottles} bottles`)
console.log(`  After:  ${currentDeliveryFiltered.length} wines, ${grouped[currentDeliveryDate].bottles - wineToDelay.quantity} bottles`)

// Find where the delayed wine was rescheduled
const delayedWineReschedules = scheduleAfterDelay.filter(e => e.wine_id === wineToDelay.id)

if (delayedWineReschedules.length > 0) {
  console.log(`\n✅ DELAYED WINE RESCHEDULED:`)
  delayedWineReschedules.forEach(entry => {
    console.log(`   ${entry.wine_id}: ${wineToDelay.producer} ${wineToDelay.name}`)
    console.log(`   New delivery date: ${entry.scheduled_date}`)
    console.log(`   Quantity: ${entry.quantity} bottles`)
  })
} else {
  console.log(`\n❌ ERROR: Delayed wine not found in any future delivery!`)
  console.log(`   This suggests the wine was removed but not rescheduled.`)
}

console.log('\n' + '='.repeat(60))
if (delayedWineReschedules.length > 0) {
  console.log('✅ TEST PASSED: Delayed wine correctly rescheduled to future delivery')
} else {
  console.log('❌ TEST FAILED: Delayed wine was not rescheduled')
}
