import * as fs from 'fs'
import * as path from 'path'

// Simple debug script to check if scheduled delivery data exists
console.log('🔍 SCHEDULED DELIVERY DEBUG TEST')
console.log('='.repeat(60))

// Simulate what should be in the database after schedule generation
const mockSchedule = [
  { wine_id: 'wine-0', scheduled_date: '2026-03-01', quantity: 6 },
  { wine_id: 'wine-1', scheduled_date: '2026-03-01', quantity: 6 },
  { wine_id: 'wine-80', scheduled_date: '2026-09-01', quantity: 6 },
  { wine_id: 'wine-100', scheduled_date: '2027-03-01', quantity: 6 },
]

console.log('\n📋 Expected Database Contents (delivery_schedule table):')
console.log(`Total entries: ${mockSchedule.length}`)
mockSchedule.forEach(entry => {
  console.log(`  - Wine: ${entry.wine_id} -> Scheduled: ${entry.scheduled_date}`)
})

// Test getWineScheduledDeliveryDate logic
console.log('\n🔎 Testing getWineScheduledDeliveryDate() Logic:')

function getWineScheduledDeliveryDate(wineId: string): string | undefined {
  // This is the logic from database.ts
  const locks = mockSchedule
  return locks.find((l: any) => l.wine_id === wineId)?.scheduled_date
}

const testWineIds = ['wine-0', 'wine-1', 'wine-80', 'wine-100', 'wine-999']
testWineIds.forEach(wineId => {
  const date = getWineScheduledDeliveryDate(wineId)
  const status = date ? '✅' : '❌'
  console.log(`${status} ${wineId}: ${date || 'NOT FOUND'}`)
})

console.log('\n💡 To verify in your app:')
console.log('1. Open browser DevTools (F12)')
console.log('2. Go to Application > Storage > Local Storage')
console.log('3. Look for "wine-app-db" key')
console.log('4. Check if it contains "delivery_schedule" entries')
console.log('')
console.log('The delivery_schedule table should have entries like:')
console.log('  { wine_id: "wine-0", scheduled_date: "2026-03-01", ... }')
console.log('')
console.log('If no delivery_schedule entries exist, the schedule may not')
console.log('have been generated or saved properly.')
console.log('')
console.log('='.repeat(60))
