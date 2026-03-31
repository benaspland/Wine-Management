/**
 * Debug script for delivery schedule generation
 * Run with: npx ts-node src/services/__tests__/delivery-schedule.debug.ts
 *
 * This traces through the algorithm with actual wine data to identify
 * where wines are being dropped from the schedule
 */

import type { Wine, Tier } from '../../types/index'
import { ScheduleService } from '../schedule.service'

// Test CSV data - will be parsed here
const CSV_DATA = `Vintage,Country,Region,Wine,Quantity,Size,Peak Drinking Window,Classification,Wine Rating,Professional Critic Ratings,Wine Notes,Varietal,Alcohol Level,Flavour Profile,Recommended Service Temp
2010,Spain,Rioja,R. Lopez de Heredia Vina Tondonia Reserva,3,750ml,2022-2045,Reserva,4,JS 97 : RP 96 : WE 96 : TA 94,"Complex and savoury with depth of black plum and blue fruit over orange rind, iron, tobacco and earthy spices. Cedar and truffle expected to develop. Juicy, zesty and tight with dusty tannins and bright berry fruit on the medium-to-full-bodied palate.",Tempranillo : Garnacha : Graciano : Mazuelo,13%,Forest floor : Wild berries : Tobacco : Cedar : Orange rind : Iron,16-18°C
2011,Italy,Piedmont,"Barolo: Massolino, Margheria",1,Magnum,2025-2045,DOCG,4,AG 93 : WS 93 : WE 93 : JS 92,"A racy Barolo with dark red and black cherries, smoke, tobacco, licorice, new leather and cloves. The rich, boisterous personality of the year comes through in a relatively fleshy, opulent Serralunga Barolo.",Nebbiolo,14.5%,Dark cherry : Smoke : Tobacco : Licorice : Leather : Clove,18-20°C
2012,Italy,Piedmont,"Barolo: Luciano Sandrone, Le Vigne",1,Magnum,2025-2050,DOCG,5,JS 97 : AG 96 : RP 95 : WS 95,"Silky and refined with layers of dark cherry, tar, rose petal and spice. Wonderfully integrated tannins and exceptional length. A towering example of the vintage.",Nebbiolo,14.5%,Dark cherry : Tar : Rose petal : Spice : Liquorice : Mineral,18-20°C
2013,Italy,Piedmont,"Barbaresco: Fiorenzo Nada, Montaribaldi",2,750ml,2025-2040,DOCG,3,JS 93 : AG 92 : RP 91,"Elegant Barbaresco with red cherry, dried herbs, rose petal and subtle earthy tones. Fine-grained tannins and good acidity give this wine excellent structure and balance.",Nebbiolo,14%,Red cherry : Dried herbs : Rose petal : Earth : Violet : Spice,18-20°C
2013,Italy,Piedmont,"Barolo: Giacomo Fenocchio, Bussia",3,750ml,2025-2045,DOCG Riserva,4,JS 95 : AG 94 : RP 93,"Powerful and structured Riserva from the Bussia cru with dark fruit, tar, leather and balsamic notes. Dense tannins and remarkable concentration suggest considerable ageing potential.",Nebbiolo,14.5%,Dark fruit : Tar : Leather : Balsamic : Tobacco : Mineral,18-20°C`

// Parse CSV to Wine objects
function parseCSV(csv: string): Wine[] {
  const lines = csv.trim().split('\n')
  const wines: Wine[] = []
  let wineId = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Simple CSV parser (handles basic cases without complex quoting)
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current.trim())

    const vintage = parseInt(cells[0])
    const country = cells[1]
    const region = cells[2]
    const wineName = cells[3].replace(/^"/, '').replace(/"$/, '')
    const quantity = parseInt(cells[4])
    const size = cells[5]
    const windowRange = cells[6]
    const [windowStart, windowEnd] = windowRange.split('-').map(w => parseInt(w))
    const classification = cells[7]
    const tierNum = parseInt(cells[8]) || 3 // Wine Rating maps to tier
    const tier = Math.max(1, Math.min(5, tierNum)) as Tier
    const notes = cells[10]
    const varietal = cells[11]
    const alcohol = parseFloat(cells[12].replace('%', ''))
    const flavorProfile = cells[13]
    const tempRange = cells[14]
    const [tempMin, tempMax] = tempRange.replace(/°C/g, '').split('-').map(t => parseInt(t))

    // Parse producer from wine name (first word or first few words)
    let producer = ''
    let name = wineName
    const firstColon = wineName.indexOf(':')
    if (firstColon > 0) {
      producer = wineName.substring(0, firstColon).trim()
      name = wineName.substring(firstColon + 1).trim()
    } else {
      const parts = wineName.split(' ')
      if (parts.length > 1) {
        producer = parts.slice(0, -1).join(' ')
        name = parts[parts.length - 1]
      } else {
        producer = wineName
        name = ''
      }
    }

    wines.push({
      id: `wine-${wineId++}`,
      producer,
      name,
      vintage,
      country,
      region,
      classification,
      wine_type: 'Red', // Default for simplicity
      varietal,
      tier,
      location: 'storage', // All import to storage
      quantity,
      format: size,
      drinking_window_start: windowStart,
      drinking_window_end: windowEnd,
      alcohol_percent: alcohol,
      serving_temp_min: tempMin,
      serving_temp_max: tempMax,
      notes,
      critic_ratings: {}, // Simplified for debug
      flavor_profile: flavorProfile,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return wines
}

// Main debug function
function debugDeliverySchedule() {
  console.log('='.repeat(80))
  console.log('DELIVERY SCHEDULE DEBUG - Wine CSV Test Data')
  console.log('='.repeat(80))

  const wines = parseCSV(CSV_DATA)
  console.log(`\n✓ Parsed ${wines.length} wines from CSV`)

  // Count total bottles
  const totalBottles = wines.reduce((sum, w) => sum + w.quantity, 0)
  console.log(`✓ Total bottles: ${totalBottles}`)

  // Show wine list
  console.log('\nWines in inventory:')
  wines.forEach((w, idx) => {
    console.log(
      `  ${idx + 1}. ${w.producer} ${w.name} (${w.vintage}) - Qty: ${w.quantity}, Tier: ${w.tier}, Window: ${w.drinking_window_start}-${w.drinking_window_end}`
    )
  })

  console.log('\n' + '='.repeat(80))
  console.log('Running delivery schedule algorithm...')
  console.log('='.repeat(80))

  const cellarCapacity = 80
  const currentBottlesAtHome = 0

  // Call the algorithm
  const schedule = ScheduleService.generateDeliverySchedule(
    wines,
    cellarCapacity,
    currentBottlesAtHome,
    [3, 9], // March and September
    30 // annual target
  )

  console.log(`\n✓ Generated ${schedule.length} delivery entries`)

  // Count scheduled wines and bottles
  const scheduledWineIds = new Set(schedule.map(d => d.wine_id))
  const scheduledBottles = schedule.reduce((sum, d) => sum + d.quantity, 0)
  const unscheduledWines = wines.filter(w => !scheduledWineIds.has(w.id))
  const unscheduledBottles = unscheduledWines.reduce((sum, w) => sum + w.quantity, 0)

  console.log(`\nScheduling Summary:`)
  console.log(`  Wines scheduled: ${scheduledWineIds.size} / ${wines.length}`)
  console.log(`  Bottles scheduled: ${scheduledBottles} / ${totalBottles}`)
  console.log(`  Bottles missing: ${unscheduledBottles} (${((unscheduledBottles / totalBottles) * 100).toFixed(1)}%)`)

  // Group by delivery date
  const byDate: Record<string, Array<{ wine: Wine; quantity: number }>> = {}
  schedule.forEach(entry => {
    if (!byDate[entry.scheduled_date]) {
      byDate[entry.scheduled_date] = []
    }
    const wine = wines.find(w => w.id === entry.wine_id)
    if (wine) {
      byDate[entry.scheduled_date].push({ wine, quantity: entry.quantity })
    }
  })

  // Show deliveries by date
  console.log('\nDeliveries by date:')
  const sortedDates = Object.keys(byDate).sort()
  sortedDates.forEach(date => {
    const deliveries = byDate[date]
    const bottleCount = deliveries.reduce((sum, d) => sum + d.quantity, 0)
    console.log(`\n  ${date} (${bottleCount} bottles, ${deliveries.length} wines):`)
    deliveries.forEach(d => {
      console.log(`    - ${d.wine.producer} ${d.wine.name} (${d.wine.vintage}): ${d.quantity} bottles`)
    })
  })

  // Show unscheduled wines
  if (unscheduledWines.length > 0) {
    console.log('\n' + '='.repeat(80))
    console.log(`UNSCHEDULED WINES (${unscheduledWines.length}):`)
    console.log('='.repeat(80))
    unscheduledWines.forEach(w => {
      console.log(`  ${w.producer} ${w.name} (${w.vintage}):`)
      console.log(`    Qty: ${w.quantity}, Tier: ${w.tier}, Window: ${w.drinking_window_start}-${w.drinking_window_end}`)
    })
  }

  console.log('\n' + '='.repeat(80))
  console.log('Analysis complete')
  console.log('='.repeat(80))
}

// Run debug
debugDeliverySchedule()
