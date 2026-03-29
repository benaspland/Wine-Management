#!/usr/bin/env node

/**
 * Test script to debug delivery schedule algorithm
 * Run with: node test-delivery-schedule.js
 */

const DELIVERY_CONFIG = {
  months: [3, 9],
  minBottles: 24,
  annualTarget: 30,
  deliveryFillRatio: 0.75,
  tier45StartYear: 2029,
};

// Simplified getMinDeliveryThreshold
function getMinDeliveryThreshold(format) {
  if (!format) return 6;
  const lower = format.toLowerCase();
  if (lower.includes('magnum')) return 3;
  if (lower.includes('half')) return 12;
  return 6; // default 750ml
}

// Simulated generateDeliverySchedule (key logic only)
function generateDeliverySchedule(wines, cellarCapacity, currentBottlesAtHome) {
  const schedule = [];
  const storageWines = wines.filter(w => w.location === 'storage');

  if (storageWines.length === 0) return [];

  const currentYear = 2026;
  const currentMonth = 3;
  const minDeliveryBottles = DELIVERY_CONFIG.minBottles;

  const candidateWines = storageWines.filter(w => {
    if (w.quantity === 0) return false;
    // Tier constraint applied per delivery slot, not here
    return true;
  });

  console.log(`\n[Algorithm] ${candidateWines.length} candidate wines (from ${storageWines.length} storage wines)`);
  console.log(`[Algorithm] Cellar capacity: ${cellarCapacity}, Current at home: ${currentBottlesAtHome}`);

  const deliveriesPerYear = {};
  const scheduledWineIds = new Set();
  let projectedInventory = currentBottlesAtHome;
  let year = currentYear;
  let monthIndex = 0;
  let loopIterations = 0;
  const maxLoopIterations = 1000;

  while (scheduledWineIds.size < candidateWines.length && loopIterations < maxLoopIterations) {
    loopIterations++;
    const month = DELIVERY_CONFIG.months[monthIndex];

    // Skip past months
    if (year === currentYear && month < currentMonth) {
      monthIndex = (monthIndex + 1) % DELIVERY_CONFIG.months.length;
      if (monthIndex === 0) year++;
      continue;
    }

    if (!deliveriesPerYear[year]) deliveriesPerYear[year] = 0;
    if (deliveriesPerYear[year] >= 2) {
      monthIndex = (monthIndex + 1) % DELIVERY_CONFIG.months.length;
      if (monthIndex === 0) year++;
      continue;
    }

    const availableCapacity = Math.max(0, cellarCapacity - projectedInventory);

    if (availableCapacity < minDeliveryBottles) {
      if (loopIterations % 100 === 0) {
        console.log(`  [${loopIterations}] ${year}-${String(month).padStart(2, '0')}: capacity ${availableCapacity} < ${minDeliveryBottles}`);
      }
      monthIndex = (monthIndex + 1) % DELIVERY_CONFIG.months.length;
      if (monthIndex === 0) year++;
      continue;
    }

    const unscheduledWines = candidateWines.filter(w => !scheduledWineIds.has(w.id));
    const eligibleWines = unscheduledWines.filter(w => {
      if (w.tier >= 4 && year < DELIVERY_CONFIG.tier45StartYear) return false;
      return true;
    });

    if (eligibleWines.length === 0) {
      if (loopIterations % 100 === 0) {
        console.log(`  [${loopIterations}] ${year}-${String(month).padStart(2, '0')}: 0 eligible wines (unscheduled: ${unscheduledWines.length})`);
      }
      monthIndex = (monthIndex + 1) % DELIVERY_CONFIG.months.length;
      if (monthIndex === 0) year++;
      continue;
    }

    // Build batch
    const deliveryBatch = [];
    let bottleCount = 0;
    const targetDeliverySize = availableCapacity;

    for (const wine of eligibleWines) {
      if (bottleCount >= targetDeliverySize) break;
      const minThreshold = getMinDeliveryThreshold(wine.format);
      const quantityToDeliver = Math.min(wine.quantity, minThreshold, targetDeliverySize - bottleCount);
      if (quantityToDeliver > 0) {
        deliveryBatch.push({ wine, quantity: quantityToDeliver });
        bottleCount += quantityToDeliver;
      }
    }

    if (bottleCount >= minDeliveryBottles) {
      for (const { wine, quantity } of deliveryBatch) {
        schedule.push({ wine_id: wine.id, quantity, scheduled_date: `${year}-${String(month).padStart(2, '0')}-01` });
        scheduledWineIds.add(wine.id);
      }
      deliveriesPerYear[year]++;
      projectedInventory += bottleCount;
      console.log(`[${loopIterations}] ${year}-${String(month).padStart(2, '0')}: DELIVERY ${bottleCount} bottles (${deliveryBatch.length} wines), inventory now ${projectedInventory}`);
    } else if (loopIterations % 100 === 0) {
      console.log(`  [${loopIterations}] ${year}-${String(month).padStart(2, '0')}: batch only ${bottleCount} bottles`);
    }

    // Consume
    const consumption = 15; // 6 months * (30/12)
    projectedInventory = Math.max(0, projectedInventory - consumption);

    monthIndex = (monthIndex + 1) % DELIVERY_CONFIG.months.length;
    if (monthIndex === 0) year++;
  }

  console.log(`\n[Result] Loop iterations: ${loopIterations}/${maxLoopIterations}`);
  console.log(`[Result] Wines scheduled: ${scheduledWineIds.size}/${candidateWines.length}`);
  const scheduledBottles = schedule.reduce((s, d) => s + d.quantity, 0);
  const totalBottles = candidateWines.reduce((s, w) => s + w.quantity, 0);
  console.log(`[Result] Bottles scheduled: ${scheduledBottles}/${totalBottles}`);

  const byYear = {};
  schedule.forEach(d => {
    const y = parseInt(d.scheduled_date.split('-')[0]);
    byYear[y] = (byYear[y] || 0) + 1;
  });
  console.log(`[Result] Deliveries by year:`, byYear);

  return schedule;
}

// Parse CSV data (full data)
const CSV_DATA = `Vintage,Country,Region,Wine,Quantity,Size,Peak Drinking Window,Classification,Wine Rating,Professional Critic Ratings,Wine Notes,Varietal,Alcohol Level,Flavour Profile,Recommended Service Temp
2010,Spain,Rioja,R. Lopez de Heredia Vina Tondonia Reserva,3,750ml,2022-2045,Reserva,4,JS 97 : RP 96 : WE 96 : TA 94,"Complex and savoury with depth of black plum and blue fruit over orange rind, iron, tobacco and earthy spices. Cedar and truffle expected to develop. Juicy, zesty and tight with dusty tannins and bright berry fruit on the medium-to-full-bodied palate.",Tempranillo : Garnacha : Graciano : Mazuelo,13%,Forest floor : Wild berries : Tobacco : Cedar : Orange rind : Iron,16-18°C
2011,Italy,Piedmont,"Barolo: Massolino, Margheria",1,Magnum,2025-2045,DOCG,4,AG 93 : WS 93 : WE 93 : JS 92,"A racy Barolo with dark red and black cherries, smoke, tobacco, licorice, new leather and cloves. The rich, boisterous personality of the year comes through in a relatively fleshy, opulent Serralunga Barolo.",Nebbiolo,14.5%,Dark cherry : Smoke : Tobacco : Licorice : Leather : Clove,18-20°C
2012,Italy,Piedmont,"Barolo: Luciano Sandrone, Le Vigne",1,Magnum,2025-2050,DOCG,5,JS 97 : AG 96 : RP 95 : WS 95,"Silky and refined with layers of dark cherry, tar, rose petal and spice. Wonderfully integrated tannins and exceptional length. A towering example of the vintage.",Nebbiolo,14.5%,Dark cherry : Tar : Rose petal : Spice : Liquorice : Mineral,18-20°C
2013,Italy,Piedmont,"Barbaresco: Fiorenzo Nada, Montaribaldi",2,750ml,2025-2040,DOCG,3,JS 93 : AG 92 : RP 91,"Elegant Barbaresco with red cherry, dried herbs, rose petal and subtle earthy tones. Fine-grained tannins and good acidity give this wine excellent structure and balance.",Nebbiolo,14%,Red cherry : Dried herbs : Rose petal : Earth : Violet : Spice,18-20°C
2013,Italy,Piedmont,"Barolo: Giacomo Fenocchio, Bussia",3,750ml,2025-2045,DOCG Riserva,4,JS 95 : AG 94 : RP 93,"Powerful and structured Riserva from the Bussia cru with dark fruit, tar, leather and balsamic notes. Dense tannins and remarkable concentration suggest considerable ageing potential.",Nebbiolo,14.5%,Dark fruit : Tar : Leather : Balsamic : Tobacco : Mineral,18-20°C
2013,Italy,Piedmont,"Barolo: Luigi Pira, Vigna Rionda",1,750ml,2025-2048,DOCG,5,JS 96 : AG 95 : RP 94,"Profound Barolo from the legendary Vigna Rionda vineyard with intense dark fruit, crushed rock, liquorice and floral aromas. Monumental structure and tannins with exceptional length.",Nebbiolo,14.5%,Dark fruit : Crushed rock : Liquorice : Violet : Tar : Iron,18-20°C`;

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const wines = [];
  let wineId = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());

    const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
    const tier = parseInt(cells[8]) || 3;

    wines.push({
      id: `wine-${wineId++}`,
      producer: cells[3].split(':')[0] || cells[3],
      name: cells[3],
      vintage: parseInt(cells[0]),
      region: cells[2],
      tier,
      location: 'storage',
      quantity: parseInt(cells[4]),
      format: cells[5],
      drinking_window_start: windowStart,
      drinking_window_end: windowEnd,
    });
  }

  return wines;
}

console.log('='.repeat(80));
console.log('DELIVERY SCHEDULE TEST');
console.log('='.repeat(80));

const wines = parseCSV(CSV_DATA);
console.log(`Parsed ${wines.length} wines from CSV`);
console.log(`Total bottles: ${wines.reduce((s, w) => s + w.quantity, 0)}`);

const schedule = generateDeliverySchedule(wines, 80, 0);
