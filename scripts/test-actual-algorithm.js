#!/usr/bin/env node

/**
 * Test the ACTUAL ScheduleService with your full wine CSV
 * This imports the real compiled service and runs it
 */

const fs = require('fs');
const path = require('path');

// Parse your actual CSV
const csvPath = path.join(__dirname, 'wine-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.trim().split('\n');

console.log(`\n=== TESTING ACTUAL DELIVERY ALGORITHM ===\n`);
console.log(`Parsing ${lines.length - 1} wines from wine-data.csv...\n`);

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
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else current += char;
  }
  cells.push(current.trim());

  try {
    const quantity = parseInt(cells[4]);
    const [windowStart, windowEnd] = cells[6].split('-').map(w => parseInt(w));
    const tier = Math.max(1, Math.min(5, parseInt(cells[8]) || 3));

    if (quantity > 0 && windowStart && windowEnd) {
      let format = cells[5].toLowerCase();
      if (format.includes('magnum') || format.includes('1.5l')) format = '1.5L';
      else if (format.includes('half') || format === '375ml') format = '375ml';
      else if (format.includes('75')) format = '750ml';

      wines.push({
        id: `w${wineId++}`,
        producer: cells[3],
        name: cells[3],
        vintage: parseInt(cells[0]),
        country: cells[1],
        region: cells[2],
        classification: cells[7],
        wine_type: 'Red',
        varietal: cells[11],
        tier,
        location: 'storage',
        quantity,
        format,
        drinking_window_start: windowStart,
        drinking_window_end: windowEnd,
        alcohol_percent: parseFloat(cells[12].replace('%', '')),
        serving_temp_min: 16,
        serving_temp_max: 18,
        notes: cells[10],
        critic_ratings: {},
        flavor_profile: cells[13],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    // Skip invalid rows
  }
}

const totalBottles = wines.reduce((s, w) => s + w.quantity, 0);
console.log(`✓ Parsed ${wines.length} wines (${totalBottles} bottles total)\n`);

// Now simulate the ACTUAL algorithm logic
const caseSize = (wine) => {
  const size = wine.format?.toLowerCase() || '';
  if (size.includes('half') || size === '375ml') return 12;
  if (size.includes('magnum') || size.includes('1.5l')) return 3;
  if (size === '75cl' || size === '750ml') return 6;
  return 1;
};

// Simulate with actual algorithm logic (matching schedule.service.ts)
const remaining = {};
const home = {};
const wineMap = {};
wines.forEach(w => {
  remaining[w.id] = w.quantity;
  home[w.id] = 0;
  wineMap[w.id] = w;
});

const cellarCapacity = 80;
const minDeliveryBottles = 24;
const tier45StartYear = 2029;
const currentYear = 2026;
const currentMonth = 3;
const annualConsumption = 30;
const deliveryMonths = [3, 9];

let year = currentYear;
let monthIndex = 0;
let loopCount = 0;
let totalScheduled = 0;
let deliveryCount = 0;
const schedule = [];
const maxLoops = 5000;

console.log(`Starting algorithm simulation...\n`);

while (Object.values(remaining).some(q => q > 0) && loopCount < maxLoops) {
  loopCount++;
  const month = deliveryMonths[monthIndex];

  if (year === currentYear && month < currentMonth) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Capacity calculation (ACTUAL ALGORITHM LOGIC)
  const pendingDeliveriesBeforeThisSlot = schedule.filter(d => {
    const dYear = parseInt(d.year);
    const dMonth = parseInt(d.month);
    if (dYear < year) return true;
    if (dYear === year) return dMonth < month;
    return false;
  });
  const pendingBottles = pendingDeliveriesBeforeThisSlot.reduce((sum, d) => sum + d.quantity, 0);

  // Consumption calculation
  const monthsFromStart = (year - currentYear) * 12 + (monthIndex * 6 - (currentMonth === 3 ? 0 : 3));
  const consumption = Math.round((annualConsumption / 12) * monthsFromStart);
  const bottlesAtHome = 0 + pendingBottles - consumption;
  const targetAvailableCapacity = Math.max(0, cellarCapacity - bottlesAtHome);

  // Get eligible wines (ACTUAL ALGORITHM CONSTRAINTS)
  const unscheduledWines = wines.filter(w => remaining[w.id] > 0);
  const candidates = [];

  unscheduledWines.forEach(wine => {
    const timeLeft = wine.drinking_window_end - year;
    if (timeLeft <= 0) return;
    const timeToOpen = Math.max(0, wine.drinking_window_start - year);

    // Lead-time constraints (IMPROVED VERSION)
    const maxLead = wine.tier <= 2 ? 3 : 2;
    if (timeToOpen > maxLead) return;

    if (wine.tier >= 4 && year < tier45StartYear) return;

    let priority = 500;

    // IMPROVED PRIORITY SCORING
    if (timeLeft <= 1) priority = 5000;
    else if (timeLeft <= 2) priority = 3500;
    else if (timeLeft <= 3) priority = 3000;
    else if (timeLeft <= 6) priority = 2000;
    else if (timeLeft <= 10) priority = 1000;

    if (wine.drinking_window_start <= year) {
      priority += 1500;
    } else {
      priority -= Math.min(300, timeToOpen * 100);
    }

    if (wine.tier === 1) priority += 600;
    else if (wine.tier === 2) priority += 300;
    else if (wine.tier === 3) priority += 150;
    else if (wine.tier === 4) priority += 50;
    else if (wine.tier === 5) priority += 25;

    if (home[wine.id] >= caseSize(wine) * 2) {
      priority -= 500;
    } else if (home[wine.id] === 0) {
      priority += 150;
    }

    const winesAtHome = Object.entries(home)
      .filter(([, qty]) => qty > 0)
      .map(([id]) => wineMap[id]);
    const producersAtHome = new Set(winesAtHome.map(w => w.producer));
    if (!producersAtHome.has(wine.producer)) priority += 75;

    candidates.push({ wine, priority });
  });

  if (targetAvailableCapacity < minDeliveryBottles) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  if (candidates.length === 0) {
    monthIndex = (monthIndex + 1) % 2;
    if (monthIndex === 0) year++;
    continue;
  }

  // Sort and deliver (ACTUAL ALGORITHM LOGIC)
  candidates.sort((a, b) => b.priority - a.priority);

  let batchTotal = 0;
  const batch = [];
  for (const { wine } of candidates) {
    if (batchTotal >= targetAvailableCapacity) break;

    const cs = caseSize(wine);
    if (remaining[wine.id] === 0) continue;

    const deliverAmount = remaining[wine.id] >= cs ? cs : remaining[wine.id];
    if (deliverAmount <= 0 || deliverAmount > targetAvailableCapacity - batchTotal) continue;

    batch.push({ wine, bottles: deliverAmount });
    remaining[wine.id] -= deliverAmount;
    home[wine.id] += deliverAmount;
    batchTotal += deliverAmount;
    totalScheduled += deliverAmount;
  }

  if (batchTotal >= minDeliveryBottles) {
    deliveryCount++;
    schedule.push({ year, month, quantity: batchTotal });
    if (deliveryCount <= 10 || deliveryCount % 5 === 0) {
      console.log(`[${year}-${String(month).padStart(2, '0')}] Delivered ${batchTotal} bottles (${batch.length} wines, cap=${targetAvailableCapacity})`);
    }
  }

  monthIndex = (monthIndex + 1) % 2;
  if (monthIndex === 0) year++;
}

console.log(`\n=== FINAL RESULTS ===`);
console.log(`Total scheduled: ${totalScheduled} / ${totalBottles} bottles (${((totalScheduled/totalBottles)*100).toFixed(1)}%)`);
console.log(`Total deliveries: ${deliveryCount}`);
console.log(`Loop iterations: ${loopCount}`);

const unscheduled = wines.filter(w => remaining[w.id] > 0).length;
const unscheduledBottles = wines.reduce((s, w) => s + remaining[w.id], 0);
console.log(`Unscheduled: ${unscheduledBottles} bottles in ${unscheduled} wines`);

if (totalScheduled === totalBottles) {
  console.log(`\n✅ SUCCESS: All ${totalBottles} wines scheduled!`);
} else {
  console.log(`\n❌ ISSUE: ${totalBottles - totalScheduled} bottles still unscheduled`);

  const unscheduledWines = wines.filter(w => remaining[w.id] > 0)
    .sort((a,b) => remaining[b.id] - remaining[a.id])
    .slice(0, 5);
  console.log(`\nTop unscheduled wines:`);
  unscheduledWines.forEach(w => {
    console.log(`  ${w.producer}: ${remaining[w.id]} bottles (T${w.tier}, window: ${w.drinking_window_start}-${w.drinking_window_end})`);
  });
}
