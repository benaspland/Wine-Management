import { describe, it } from 'vitest'
import { ScheduleService } from '../schedule.service'
import { ImportService } from '../import.service'
import type { Wine } from '../../types/index'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Simulate the import service's csvRowToWine by running the actual import logic
// We need to replicate what the app does: parse CSV -> create wines -> run schedules

describe('Full simulation with real CSV data', () => {
  it('should generate delivery and drinking schedules from wine-data.csv', async () => {
    // Read and parse the CSV manually using the same logic as ImportService
    const csvPath = resolve(__dirname, '../../../../wine-data.csv')
    const csvText = readFileSync(csvPath, 'utf-8')
    const lines = csvText.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

    // Parse CSV using the same approach as ImportService
    const wines: Wine[] = []
    let idCounter = 0

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        // Simple CSV parse handling quoted fields
        const values: string[] = []
        let current = ''
        let inQuotes = false
        for (let j = 0; j < line.length; j++) {
          const char = line[j]
          const nextChar = line[j + 1]
          if (char === '"') {
            if (inQuotes && nextChar === '"') { current += '"'; j++ }
            else { inQuotes = !inQuotes }
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim().replace(/^"|"$/g, ''))
            current = ''
          } else {
            current += char
          }
        }
        values.push(current.trim().replace(/^"|"$/g, ''))

        const row: Record<string, string> = {}
        headers.forEach((header, index) => { row[header] = values[index] || '' })

        // Parse drinking window
        const windowParts = row['Peak Drinking Window'].split('-')
        const windowStart = parseInt(windowParts[0])
        const windowEnd = parseInt(windowParts[1])

        // Parse tier
        const tier = Math.max(1, Math.min(5, parseInt(row['Wine Rating']) || 1)) as 1|2|3|4|5

        const wine: Wine = {
          id: `wine-${idCounter++}`,
          name: row['Wine'] || 'Unknown',
          vintage: parseInt(row['Vintage']) || 2020,
          tier,
          region: row['Region']?.trim() || 'Unknown',
          producer: row['Wine']?.split(' ')[0] || 'Unknown',
          drinking_window_start: windowStart,
          drinking_window_end: windowEnd,
          quantity_in_storage: parseInt(row['Quantity']) || 0,
          quantity_at_home: 0, // All imported wines go to storage
          format: row['Size']?.trim() || '750ml',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        }

        wines.push(wine)
      } catch (e) {
        console.error(`Error parsing row ${i}: ${(e as Error).message}`)
      }
    }

    console.log(`\n========================================`)
    console.log(`PARSED ${wines.length} WINES FROM CSV`)
    console.log(`========================================`)

    const totalBottles = wines.reduce((sum, w) => sum + w.quantity_in_storage, 0)
    console.log(`Total bottles in storage: ${totalBottles}`)
    console.log(`Wines at home: ${wines.filter(w => w.quantity_at_home > 0).length}`)
    console.log(`Wines in storage: ${wines.filter(w => w.quantity_in_storage > 0).length}`)

    // Config: 100 capacity, min 24 delivery, 45 target consumption
    const cellarCapacity = 100
    const annualTarget = 45
    const deliveryMonths: [number, number] = [3, 9]

    // Step 1: Generate delivery schedule
    console.log(`\n========================================`)
    console.log(`GENERATING DELIVERY SCHEDULE`)
    console.log(`Capacity: ${cellarCapacity}, Target: ${annualTarget}/yr`)
    console.log(`========================================`)

    const deliveries = ScheduleService.generateDeliverySchedule(
      wines, cellarCapacity, 0, deliveryMonths, annualTarget
    )

    // Group deliveries by date
    const deliveryByDate: Record<string, Array<{ wine: Wine; bottles: number }>> = {}
    deliveries.forEach(d => {
      if (!deliveryByDate[d.scheduled_date]) deliveryByDate[d.scheduled_date] = []
      const wine = wines.find(w => w.id === d.wine_id)!
      deliveryByDate[d.scheduled_date].push({ wine, bottles: d.quantity })
    })

    const sortedDates = Object.keys(deliveryByDate).sort()

    console.log(`\nTotal delivery entries: ${deliveries.length}`)
    console.log(`Total bottles scheduled: ${deliveries.reduce((s, d) => s + d.quantity, 0)}`)
    console.log(`Number of delivery windows: ${sortedDates.length}`)

    // Print first 3 deliveries
    console.log(`\n========================================`)
    console.log(`FIRST 3 DELIVERIES`)
    console.log(`========================================`)

    for (let i = 0; i < Math.min(3, sortedDates.length); i++) {
      const date = sortedDates[i]
      const winesInDelivery = deliveryByDate[date]
      const totalBottlesInDelivery = winesInDelivery.reduce((s, w) => s + w.bottles, 0)

      console.log(`\n--- Delivery ${i + 1}: ${date} ---`)
      console.log(`${winesInDelivery.length} wines, ${totalBottlesInDelivery} bottles`)

      winesInDelivery.forEach(({ wine, bottles }) => {
        console.log(`  ${wine.name} (${wine.vintage}) - ${bottles} bottles [Tier ${wine.tier}] [${wine.format}] [${wine.region}]`)
      })
    }

    // Step 2: Generate drinking schedule
    console.log(`\n========================================`)
    console.log(`GENERATING DRINKING SCHEDULE`)
    console.log(`========================================`)

    const yearsNeeded = Math.ceil((wines.length / 30) * 1.5) + 5
    const drinkingSchedule = ScheduleService.generateDrinkingSchedule(
      wines, deliveries, 2026, yearsNeeded, annualTarget
    )

    console.log(`Total drinking entries: ${drinkingSchedule.length}`)

    // Print first 12 months of consumption
    console.log(`\n========================================`)
    console.log(`FIRST 12 MONTHS OF CONSUMPTION`)
    console.log(`========================================`)

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']

    // Group by year-month
    const byMonth: Record<string, typeof drinkingSchedule> = {}
    drinkingSchedule.forEach(entry => {
      const key = `${entry.suggestedYear}-${String(entry.suggestedMonth).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = []
      byMonth[key].push(entry)
    })

    const sortedMonths = Object.keys(byMonth).sort()
    let monthCount = 0
    let totalConsumed = 0

    for (const monthKey of sortedMonths) {
      if (monthCount >= 12) break
      const entries = byMonth[monthKey]
      const [yearStr, monthStr] = monthKey.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)

      console.log(`\n--- ${monthNames[month]} ${year} (${entries.length} wines) ---`)
      entries.forEach(entry => {
        const wine = wines.find(w => w.id === entry.wineId)
        const delivery = deliveries.find(d => d.wine_id === entry.wineId)
        console.log(`  ${entry.producer} - ${entry.name} (${entry.vintage}) [Tier ${entry.tier}] [Delivery: ${delivery?.scheduled_date || 'at home'}]`)
      })
      totalConsumed += entries.length
      monthCount++
    }

    console.log(`\n========================================`)
    console.log(`SUMMARY: ${totalConsumed} wines in first ${monthCount} months`)
    console.log(`========================================`)

    // Verify: no consumption before delivery
    let violations = 0
    for (const entry of drinkingSchedule) {
      const delivery = deliveries.find(d => d.wine_id === entry.wineId)
      if (delivery) {
        const deliveryYM = delivery.scheduled_date.substring(0, 7)
        const consumeYM = `${entry.suggestedYear}-${String(entry.suggestedMonth).padStart(2, '0')}`
        if (consumeYM < deliveryYM) {
          console.log(`VIOLATION: ${entry.name} consumed ${consumeYM} but delivered ${deliveryYM}`)
          violations++
        }
      }
    }
    console.log(`\nConsumption-before-delivery violations: ${violations}`)
  })
})
